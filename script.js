const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.dot');
const hamburger = document.getElementById('hamburger');
const navLinks = document.querySelector('.nav-links');
let index = 0;
let autoSlideInterval;

// Only run hamburger menu if elements exist (on pages that have them)
if (hamburger && navLinks) {
    // Hamburger menu toggle
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navLinks.classList.toggle('active');
    });

    // Close menu when a link is clicked
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navLinks.classList.remove('active');
        });
    });
}

// Only run slider if elements exist
if (slides.length > 0 && dots.length > 0) {
    function updateSlide(newIndex) {
        slides.forEach(slide => slide.classList.remove('active'));
        dots.forEach(dot => dot.classList.remove('active'));
        
        slides[newIndex].classList.add('active');
        dots[newIndex].classList.add('active');
    }

    function showSlide() {
        index = (index + 1) % slides.length;
        updateSlide(index);
    }

    function goToSlide(newIndex) {
        index = newIndex;
        updateSlide(index);
        clearInterval(autoSlideInterval);
        autoSlideInterval = setInterval(showSlide, 3000);
    }

    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            const newIndex = parseInt(dot.dataset.index);
            goToSlide(newIndex);
        });
    });

    autoSlideInterval = setInterval(showSlide, 3000);
} 


// API lives on the same Vercel deployment under /api
const API_BASE = (typeof window !== 'undefined' && window.API_URL)
    ? window.API_URL.replace(/\/$/, '')
    : '/api';

async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { error: text.slice(0, 120) || 'Invalid server response' };
    }
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function goToDashboard() {
    window.location.replace('dashboard.html');
}

function goToVerification() {
    window.location.replace('verification.html');
}

function setSessionUser(username, email, token) {
    if (username) localStorage.setItem('currentUsername', username);
    if (email) localStorage.setItem('currentEmail', email);
    if (token) localStorage.setItem('authToken', token);
}

// Utility function to show messages
function showMessage(message, isError = false) {
    const existingMsg = document.querySelector('.message');
    if (existingMsg) existingMsg.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isError ? 'error' : 'success'}`;
    msgDiv.textContent = message;
    msgDiv.style.cssText = `
        padding: 10px;
        margin: 10px 0;
        border-radius: 5px;
        color: white;
        background-color: ${isError ? '#dc3545' : '#28a745'};
        text-align: center;
        z-index: 1000;
    `;

    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(msgDiv, container.firstChild);
    } else {
        // Fallback: insert at body if container not found
        document.body.insertBefore(msgDiv, document.body.firstChild);
    }

    setTimeout(() => msgDiv.remove(), 5000);
}

// Signup form handler
const signupForm = document.getElementById('signupForm');
if (signupForm) {
    signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const username = document.getElementById('username').value.trim();
        const email = normalizeEmail(document.getElementById('email').value);
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (!username || !email || !password || !confirmPassword) {
            showMessage('All fields are required', true);
            return;
        }

        if (password !== confirmPassword) {
            showMessage('Passwords do not match', true);
            return;
        }

        const submitBtn = signupForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const data = await readJsonResponse(response);

            if (!response.ok) {
                showMessage(data.error || 'Sign up failed', true);
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            localStorage.setItem('pendingEmail', email);
            localStorage.setItem('pendingUsername', username);
            // devOtp is only returned by the server outside production when email isn't configured
            if (data.devOtp) localStorage.setItem('prefillOtp', data.devOtp);
            else localStorage.removeItem('prefillOtp');
            goToVerification();
        } catch (error) {
            showMessage('Could not reach the server. Check your connection and try again.', true);
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

// Signin form handler
const signinForm = document.getElementById('signinForm');
if (signinForm) {
    signinForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = normalizeEmail(document.getElementById('email').value);
        const password = document.getElementById('password').value;

        try {
            const response = await fetch(`${API_BASE}/signin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await readJsonResponse(response);

            if (response.ok) {
                const apiUser = data.user || {};
                setSessionUser(apiUser.username || email.split('@')[0], email, data.token);
                showMessage('Sign in successful!');
                setTimeout(goToDashboard, 400);
                return;
            }

            if (response.status === 403) {
                localStorage.setItem('pendingEmail', email);
            }
            showMessage(data.error || 'Sign in failed', true);
        } catch (error) {
            showMessage('Could not reach the server. Check your connection and try again.', true);
        }
    });
}

// Verification form handler
const verificationForm = document.getElementById('verificationForm');
if (verificationForm) {
    const codeInput = document.getElementById('codeInput');

    if (codeInput) {
        const code = localStorage.getItem('prefillOtp') || '';
        if (code) codeInput.value = String(code);
    }

    verificationForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = normalizeEmail(localStorage.getItem('pendingEmail'));
        const otp = codeInput ? codeInput.value.trim() : '';

        if (!email) {
            showMessage('No email found. Please sign up again.', true);
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp })
            });
            const data = await readJsonResponse(response);

            if (response.ok) {
                const apiUser = data.user || {};
                setSessionUser(
                    apiUser.username || localStorage.getItem('pendingUsername'),
                    email,
                    data.token
                );
                localStorage.removeItem('pendingEmail');
                localStorage.removeItem('pendingUsername');
                localStorage.removeItem('prefillOtp');
                showMessage('Account verified successfully!');
                setTimeout(goToDashboard, 400);
                return;
            }

            showMessage(data.error || 'Verification failed', true);
        } catch (error) {
            showMessage('Could not reach the server. Check your connection and try again.', true);
        }
    });
}

// Dashboard username reflection
const usernameNav = document.getElementById('usernameNav');
const usernameWelcome = document.getElementById('usernameWelcome');
if (usernameNav || usernameWelcome) {
    const name =
        localStorage.getItem('currentUsername') ||
        localStorage.getItem('pendingUsername') ||
        'User';

    if (usernameNav) usernameNav.textContent = name;
    if (usernameWelcome) usernameWelcome.textContent = name;
}

// Toggle password visibility
function togglepassword(event) {
    // Get the clicked element
    const toggleBtn = event ? event.target.closest('.toggle') : null;
    let passwordInput, eyeIcon;

    if (toggleBtn) {
        // If called from onclick, find the associated password input
        const container = toggleBtn.closest('.password-container');
        passwordInput = container.querySelector('input[type="password"], input[type="text"]');
        eyeIcon = toggleBtn.querySelector('i');
    } else {
        // Fallback for general usage
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        const eyes = document.querySelectorAll('#togglePassword');

        passwordInputs.forEach((password, index) => {
            const eye = eyes[index];
            if (password && eye) {
                if (password.type === 'password') {
                    password.type = 'text';
                    eye.classList.remove('fa-eye');
                    eye.classList.add('fa-eye-slash');
                } else {
                    password.type = 'password';
                    eye.classList.remove('fa-eye-slash');
                    eye.classList.add('fa-eye');
                }
            }
        });
        return;
    }

    // Toggle the specific password field
    if (passwordInput && eyeIcon) {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            eyeIcon.classList.remove('fa-eye');
            eyeIcon.classList.add('fa-eye-slash');
        } else {
            passwordInput.type = 'password';
            eyeIcon.classList.remove('fa-eye-slash');
            eyeIcon.classList.add('fa-eye');
        }
    }
}

// Navigation handlers
const signinBtn = document.getElementById('signinBtn');
if (signinBtn) {
    signinBtn.addEventListener('click', () => {
        window.location.href = 'signin.html';
    });
}

const signupBtn = document.getElementById('signupBtn');
if (signupBtn) {
    signupBtn.addEventListener('click', () => {
        window.location.href = 'signup.html';
    });
}

const verifyBtn = document.getElementById('verifyBtn');
if (verifyBtn) {
    verifyBtn.addEventListener('click', () => {
        window.location.href = 'verification.html';
    });
}

// Cart functionality
let cartCount = 0;
let cartItems = JSON.parse(localStorage.getItem('cartItems')) || []; // changed
cartCount = cartItems.length; // add this line

function addToCart(button) {
    // Get product details from the card
    const card = button.closest('.card');
    if (card) {
        const productName = card.querySelector('h3').textContent;
        const productPrice = card.querySelector('.price').textContent;
        const productId = Math.random().toString(36).substr(2, 9); // Generate unique ID for each item
        
        // Add item to cart array
        cartItems.push({
            id: productId,
            name: productName,
            price: productPrice,
            image: card.querySelector('img').src
        });
        localStorage.setItem('cartItems', JSON.stringify(cartItems)); // add this line
        
        // Increment cart count
        cartCount++;
        
        // Update cart count display in header
        const cartCountElement = document.getElementById('cartCount');
        if (cartCountElement) {
            cartCountElement.textContent = cartCount;
        }
        
        // Show success message
        showMessage(`${productName} added to cart!`);
        
        // Add visual feedback to button
        button.style.backgroundColor = '#28a745';
        button.style.color = 'white';
        setTimeout(() => {
            button.style.backgroundColor = '';
            button.style.color = '';
        }, 500);
    }
}

// Open cart modal
function openCartModal() {
    const modal = document.getElementById('cartModal');
    if (modal) {
        modal.style.display = 'flex';
        updateCartDisplay();
    }
}

// Close cart modal
function closeCartModal() {
    const modal = document.getElementById('cartModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Update cart items display in modal
function updateCartDisplay() {
    const cartItemsContainer = document.getElementById('cartItems');
    if (!cartItemsContainer) return;
    
    if (cartItems.length === 0) {
        cartItemsContainer.innerHTML = '<p class="empty-cart">Your cart is empty</p>';
        return;
    }
    
    let cartHTML = '';
    cartItems.forEach((item, index) => {
        cartHTML += `
            <div class="cart-item">
                <div class="item-image">
                    <img src="${item.image}" alt="${item.name}">
                </div>
                <div class="item-details">
                    <h4>${item.name}</h4>
                    <p class="item-price">${item.price}</p>
                </div>
                <button class="btn-remove" onclick="removeFromCart(${index})">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>
        `;
    });
    
    cartItemsContainer.innerHTML = cartHTML;
}

// Remove item from cart
function removeFromCart(index) {
    if (index >= 0 && index < cartItems.length) {
        const removedItem = cartItems[index];
        cartItems.splice(index, 1);
        localStorage.setItem('cartItems', JSON.stringify(cartItems)); // add this line
        
        // Update cart count
        cartCount--;
        const cartCountElement = document.getElementById('cartCount');
        if (cartCountElement) {
            cartCountElement.textContent = cartCount;
        }
        
        // Update cart display
        updateCartDisplay();
        
        // Show message
        showMessage(`${removedItem.name} removed from cart`, false);
    }
}

// Cart icon click handler
const cartIcon = document.getElementById('cartIcon');
if (cartIcon) {
    cartIcon.addEventListener('click', openCartModal);
}
// Proceed to checkout button
const proceedToCheckoutBtn = document.getElementById('proceedToCheckoutBtn');
if (proceedToCheckoutBtn) {
    proceedToCheckoutBtn.addEventListener('click', () => {
        if (cartItems.length === 0) {
            showMessage('Your cart is empty', true);
            return;
        }
        window.location.href = 'checkout.html';
    });
}

// Close modal when clicking outside the modal content
const modal = document.getElementById('cartModal');
if (modal) {
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeCartModal();
        }
    });
}

// Logout function
function logout() {
    localStorage.removeItem('currentUsername');
    localStorage.removeItem('currentEmail');
    localStorage.removeItem('authToken');
    window.location.href = 'index.html';
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
}
const statesByCountry = {
    NG: [
      "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
      "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
      "Abuja (FCT)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina",
      "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo",
      "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"
    ],
    DE: [
      "Baden-Württemberg", "Bavaria", "Berlin", "Brandenburg", "Bremen",
      "Hamburg", "Hesse", "Lower Saxony", "Mecklenburg-Vorpommern",
      "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland", "Saxony",
      "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia"
    ],
    GB: ["England", "Scotland", "Wales", "Northern Ireland"],
    FR: [
      "Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Brittany",
      "Centre-Val de Loire", "Corsica", "Grand Est", "Hauts-de-France",
      "Île-de-France", "Normandy", "Nouvelle-Aquitaine", "Occitanie",
      "Pays de la Loire", "Provence-Alpes-Côte d'Azur"
    ],
    US: [
      "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
      "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
      "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
      "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
      "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
      "New Hampshire", "New Jersey", "New Mexico", "New York",
      "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
      "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
      "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
      "West Virginia", "Wisconsin", "Wyoming"
    ]
  };
  
  const countrySelect = document.getElementById("country");
  const stateSelect = document.getElementById("state");
  
  if (countrySelect && stateSelect) {  // add this check
    countrySelect.addEventListener("change", function () {
        const selectedCountry = this.value;

    // Reset state dropdown
    stateSelect.innerHTML = '<option value="">Select state</option>';
  
    if (statesByCountry[selectedCountry]) {
      statesByCountry[selectedCountry].forEach(function (state) {
        const option = document.createElement("option");
        option.value = state;
        option.textContent = state;
        stateSelect.appendChild(option);
      });
      stateSelect.disabled = false;
    } else {
      // No country selected (blank option chosen)
      stateSelect.innerHTML = '<option value="">Select country first</option>';
      stateSelect.disabled = true;
    }
  });
  }
  function renderCheckoutCart() {
    const container = document.getElementById('checkout-cart-items');
    if (!container) return; // not on checkout page, skip

    container.innerHTML = '';
    let subtotal = 0;

    cartItems.forEach(item => {
        const price = parseFloat(String(item.price).replace(/[^0-9.]/g, ''));
        subtotal += price;

        container.innerHTML += `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.name}">
                <div>
                    <p>${item.name}</p>
                    <p>${item.price}</p>
                </div>
            </div>
        `;
    });

    // Get selected shipping cost from the radio cards
    const selectedShipping = document.querySelector('input[name="shipping-method"]:checked');
    const shippingCost = selectedShipping && selectedShipping.value === 'door' ? 5 : 2;

    const total = subtotal + shippingCost;

    document.getElementById('subtotal').textContent = `₦${subtotal.toLocaleString()}`;
    document.getElementById('shipping-cost').textContent = `₦${shippingCost.toLocaleString()}`;
    document.getElementById('total').textContent = `₦${total.toLocaleString()}`;
}

renderCheckoutCart(); // run on page load

// Re-run whenever shipping method changes
document.querySelectorAll('input[name="shipping-method"]').forEach(radio => {
    radio.addEventListener('change', renderCheckoutCart);
});