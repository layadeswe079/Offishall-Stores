const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json({ limit: "20kb" }));

/* ---------- Database (cached across serverless invocations) ---------- */
let cached = global._mongoose;
if (!cached) cached = global._mongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, { bufferCommands: false })
      .then((m) => m);
  }
  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, maxlength: 40 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    verified: { type: Boolean, default: false },
    otpHash: String,
    otpExpiresAt: Date,
    otpAttempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);
const User = mongoose.models.User || mongoose.model("User", userSchema);

/* ---------- Helpers ---------- */
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (e) => String(e || "").trim().toLowerCase();
const hashOtp = (otp) => crypto.createHash("sha256").update(String(otp)).digest("hex");
const generateOtp = () => String(crypto.randomInt(100000, 1000000));

function signToken(user) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not set");
  return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendOtpEmail(to, username, otp) {
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: "Your Offishall Stores verification code",
    text: `Hi ${username},\n\nYour verification code is ${otp}. It expires in 10 minutes.\n\nIf you didn't sign up, you can ignore this email.`,
  });
}

// Creates a fresh OTP on the user, saves it, and emails it.
async function issueOtp(user) {
  const otp = generateOtp();
  user.otpHash = hashOtp(otp);
  user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.otpAttempts = 0;
  await user.save();

  if (smtpConfigured()) {
    await sendOtpEmail(user.email, user.username, otp);
    return {};
  }
  // No SMTP configured: never expose the code in production.
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Email is not configured on the server");
  }
  console.log(`[dev] OTP for ${user.email}: ${otp}`);
  return { devOtp: otp };
}

const publicUser = (u) => ({ username: u.username, email: u.email });

/* ---------- Routes ---------- */
const router = express.Router();

router.get("/health", (req, res) => res.json({ ok: true }));

router.post("/signup", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!username || !email || !password)
      return res.status(400).json({ error: "All fields are required" });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Invalid email address" });
    if (password.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters" });

    await connectDB();
    let user = await User.findOne({ email });

    if (user && user.verified)
      return res.status(409).json({ error: "An account with this email already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    if (user) {
      // Unverified account re-signing up: update details and resend the code.
      user.username = username;
      user.passwordHash = passwordHash;
    } else {
      user = new User({ username, email, passwordHash });
    }

    const extra = await issueOtp(user);
    res.status(201).json({ message: "Verification code sent", ...extra });
  } catch (err) {
    console.error("signup error:", err);
    res.status(500).json({ error: "Could not create account. Please try again." });
  }
});

router.post("/resend", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    await connectDB();
    const user = await User.findOne({ email });
    // Same response whether or not the account exists, to avoid leaking emails.
    if (!user || user.verified) return res.json({ message: "If the account exists, a code was sent" });
    const extra = await issueOtp(user);
    res.json({ message: "Verification code sent", ...extra });
  } catch (err) {
    console.error("resend error:", err);
    res.status(500).json({ error: "Could not resend code. Please try again." });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();
    if (!email || !otp) return res.status(400).json({ error: "Email and code are required" });

    await connectDB();
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "Account not found. Please sign up again." });

    if (user.verified) {
      return res.json({ message: "Already verified", token: signToken(user), user: publicUser(user) });
    }
    if (!user.otpHash || !user.otpExpiresAt || user.otpExpiresAt < new Date())
      return res.status(400).json({ error: "Code expired. Request a new one." });
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS)
      return res.status(429).json({ error: "Too many attempts. Request a new code." });

    if (user.otpHash !== hashOtp(otp)) {
      user.otpAttempts += 1;
      await user.save();
      return res.status(400).json({ error: "Invalid verification code" });
    }

    user.verified = true;
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    user.otpAttempts = 0;
    await user.save();

    res.json({ message: "Account verified", token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error("verify error:", err);
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

router.post("/signin", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    await connectDB();
    const user = await User.findOne({ email });
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });
    if (!user.verified)
      return res.status(403).json({ error: "Account not verified. Complete verification first." });

    res.json({ message: "Signed in", token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error("signin error:", err);
    res.status(500).json({ error: "Sign in failed. Please try again." });
  }
});

app.use("/api", router);
app.use((req, res) => res.status(404).json({ error: "Not found" }));

module.exports = app;
