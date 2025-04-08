/**
 * Shopping Cart Module
 * Handles cart operations and UI updates
 */
class Cart {
  constructor() {
    this.items = [];
    this.total = 0;
    this.cartContainer = document.querySelector('.cart-container');
    this.cartItemsContainer = document.querySelector('.cart-items');
    this.cartTotal = document.querySelector('.cart-total');
    this.cartCount = document.querySelector('.cart-count');
    this.checkoutBtn = document.querySelector('.checkout-btn');
    
    this.init();
  }
  
  /**
   * Initialize the cart
   */
  async init() {
    try {
      // Load cart data from localStorage or API
      const savedCart = localStorage.getItem('ecopilot_cart');
      if (savedCart) {
        this.items = JSON.parse(savedCart);
      } else {
        // Try to fetch from API if available
        const response = await fetch('/api/cart');
        if (response.ok) {
          this.items = await response.json();
        }
      }
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Calculate initial total
      this.calculateTotal();
      
      // Update UI
      this.updateUI();
      
    } catch (error) {
      this.showError('Failed to initialize cart');
      console.error('Cart initialization error:', error);
    }
  }
  
  /**
   * Set up event listeners for cart interactions
   */
  setupEventListeners() {
    // Add to cart buttons
    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const productId = e.target.dataset.productId;
        const product = {
          id: productId,
          name: e.target.dataset.name,
          price: parseFloat(e.target.dataset.price),
          image: e.target.dataset.image,
          quantity: 1
        };
        this.addItem(product);
      });
    });
    
    // Quantity update inputs
    this.cartContainer.addEventListener('change', (e) => {
      if (e.target.classList.contains('quantity-input')) {
        const itemId = e.target.dataset.itemId;
        const newQuantity = parseInt(e.target.value);
        this.updateQuantity(itemId, newQuantity);
      }
    });
    
    // Remove item buttons
    this.cartContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-item-btn')) {
        const itemId = e.target.dataset.itemId;
        this.removeItem(itemId);
      }
    });
    
    // Checkout button
    this.checkoutBtn.addEventListener('click', () => {
      this.proceedToCheckout();
    });
  }
  
  /**
   * Add an item to the cart
   * @param {Object} product - The product to add
   */
  addItem(product) {
    try {
      const existingItem = this.items.find(item => item.id === product.id);
      
      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        this.items.push(product);
      }
      
      this.saveCart();
      this.calculateTotal();
      this.updateUI();
      this.showSuccess('Item added to cart');
      
      // Track event
      if (window.ECO_METRICS) {
        window.ECO_METRICS.track('product_added_to_cart', {
          product_id: product.id,
          price: product.price,
          currency: 'USD'
        });
      }
    } catch (error) {
      this.showError('Failed to add item to cart');
      console.error('Add to cart error:', error);
    }
  }
  
  /**
   * Update item quantity
   * @param {string} itemId - The item ID
   * @param {number} quantity - New quantity
   */
  updateQuantity(itemId, quantity) {
    try {
      const item = this.items.find(item => item.id === itemId);
      
      if (item) {
        if (quantity > 0) {
          item.quantity = quantity;
        } else {
          this.removeItem(itemId);
          return;
        }
      }
      
      this.saveCart();
      this.calculateTotal();
      this.updateUI();
    } catch (error) {
      this.showError('Failed to update quantity');
      console.error('Update quantity error:', error);
    }
  }
  
  /**
   * Remove an item from the cart
   * @param {string} itemId - The item ID to remove
   */
  removeItem(itemId) {
    try {
      this.items = this.items.filter(item => item.id !== itemId);
      this.saveCart();
      this.calculateTotal();
      this.updateUI();
      this.showSuccess('Item removed from cart');
    } catch (error) {
      this.showError('Failed to remove item');
      console.error('Remove item error:', error);
    }
  }
  
  /**
   * Calculate cart total
   */
  calculateTotal() {
    this.total = this.items.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);
  }
  
  /**
   * Update cart UI
   */
  updateUI() {
    // Update cart count
    const totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
    this.cartCount.textContent = totalItems;
    
    // Update items list
    this.cartItemsContainer.innerHTML = this.items.map(item => `
      <div class="cart-item" data-item-id="${item.id}">
        <img src="${item.image}" alt="${item.name}" class="cart-item-image">
        <div class="cart-item-details">
          <h3>${item.name}</h3>
          <p class="price">$${item.price.toFixed(2)}</p>
          <div class="quantity-controls">
            <input type="number" 
                   class="quantity-input" 
                   value="${item.quantity}" 
                   min="0" 
                   data-item-id="${item.id}">
            <button class="remove-item-btn" data-item-id="${item.id}">
              Remove
            </button>
          </div>
        </div>
      </div>
    `).join('');
    
    // Update total
    this.cartTotal.textContent = `$${this.total.toFixed(2)}`;
    
    // Update checkout button state
    this.checkoutBtn.disabled = this.items.length === 0;
  }
  
  /**
   * Save cart data
   */
  saveCart() {
    localStorage.setItem('ecopilot_cart', JSON.stringify(this.items));
  }
  
  /**
   * Show success message
   * @param {string} message - Success message
   */
  showSuccess(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-success';
    alert.textContent = message;
    this.cartContainer.insertAdjacentElement('beforebegin', alert);
    setTimeout(() => alert.remove(), 3000);
  }
  
  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-error';
    alert.textContent = message;
    this.cartContainer.insertAdjacentElement('beforebegin', alert);
    setTimeout(() => alert.remove(), 3000);
  }
  
  /**
   * Proceed to checkout
   */
  proceedToCheckout() {
    if (this.items.length === 0) {
      this.showError('Your cart is empty');
      return;
    }
    
    // Track checkout event
    if (window.ECO_METRICS) {
      window.ECO_METRICS.track('checkout_started', {
        cart_id: Date.now().toString(),
        total: this.total,
        currency: 'USD'
      });
    }
    
    // Redirect to checkout page
    window.location.href = '/checkout';
  }
}

// Initialize cart when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.cart = new Cart();
}); 