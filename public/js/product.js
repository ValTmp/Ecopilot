class ProductDetails {
  constructor() {
    this.productId = this.getProductIdFromUrl();
    this.productImage = document.querySelector('#product-image');
    this.thumbnailContainer = document.querySelector('#thumbnail-container');
    this.productName = document.querySelector('#product-name');
    this.productPrice = document.querySelector('#product-price');
    this.productImpact = document.querySelector('#product-impact');
    this.productDescription = document.querySelector('#product-description');
    this.ecoBenefitsList = document.querySelector('#eco-benefits-list');
    this.productSpecs = document.querySelector('#product-specs');
    this.quantityInput = document.querySelector('#quantity');
    this.decreaseButton = document.querySelector('#decrease-quantity');
    this.increaseButton = document.querySelector('#increase-quantity');
    this.addToCartButton = document.querySelector('#add-to-cart');
    this.relatedProductsContainer = document.querySelector('#related-products');
    
    this.init();
  }
  
  getProductIdFromUrl() {
    const path = window.location.pathname;
    return path.split('/').pop();
  }
  
  async init() {
    try {
      await this.loadProductDetails();
      this.setupEventListeners();
    } catch (error) {
      console.error('Error initializing product details:', error);
      this.showError('Failed to load product details. Please try again later.');
    }
  }
  
  setupEventListeners() {
    // Quantity controls
    this.decreaseButton.addEventListener('click', () => {
      const currentValue = parseInt(this.quantityInput.value);
      if (currentValue > 1) {
        this.quantityInput.value = currentValue - 1;
      }
    });
    
    this.increaseButton.addEventListener('click', () => {
      const currentValue = parseInt(this.quantityInput.value);
      if (currentValue < 10) {
        this.quantityInput.value = currentValue + 1;
      }
    });
    
    // Add to cart
    this.addToCartButton.addEventListener('click', () => {
      this.addToCart();
    });
  }
  
  async loadProductDetails() {
    try {
      const response = await fetch(`/api/products/${this.productId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load product details');
      }
      
      const product = await response.json();
      this.renderProductDetails(product);
      this.loadRelatedProducts(product.category);
    } catch (error) {
      console.error('Error loading product details:', error);
      throw error;
    }
  }
  
  renderProductDetails(product) {
    // Update page title
    document.title = `EcoPilot - ${product.name}`;
    
    // Main product info
    this.productName.textContent = product.name;
    this.productPrice.textContent = `$${product.price.toFixed(2)}`;
    this.productImpact.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
      </svg>
      Saves ${product.co2Savings} kg CO2
    `;
    this.productDescription.textContent = product.description;
    
    // Product images
    this.productImage.src = product.images[0];
    this.productImage.alt = product.name;
    
    this.thumbnailContainer.innerHTML = product.images.map((image, index) => `
      <div class="thumbnail ${index === 0 ? 'active' : ''}" onclick="productDetails.changeImage(${index})">
        <img src="${image}" alt="${product.name} - Image ${index + 1}">
      </div>
    `).join('');
    
    // Eco benefits
    this.ecoBenefitsList.innerHTML = product.ecoBenefits.map(benefit => `
      <li>
        <svg viewBox="0 0 24 24">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        ${benefit}
      </li>
    `).join('');
    
    // Product specifications
    this.productSpecs.innerHTML = Object.entries(product.specifications).map(([key, value]) => `
      <div class="spec-item">
        <div class="spec-label">${key}</div>
        <div class="spec-value">${value}</div>
      </div>
    `).join('');
  }
  
  async loadRelatedProducts(category) {
    try {
      const response = await fetch(`/api/products/related?category=${category}&limit=4`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load related products');
      }
      
      const products = await response.json();
      this.renderRelatedProducts(products);
    } catch (error) {
      console.error('Error loading related products:', error);
      throw error;
    }
  }
  
  renderRelatedProducts(products) {
    this.relatedProductsContainer.innerHTML = products.map(product => `
      <div class="product-card">
        <div class="product-image" style="background-image: url('${product.image}')"></div>
        <div class="product-details">
          <h3>${product.name}</h3>
          <p>${product.description}</p>
          <div class="product-meta">
            <div class="product-price">$${product.price.toFixed(2)}</div>
            <div class="product-impact">
              <svg viewBox="0 0 24 24">
                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
              </svg>
              Saves ${product.co2Savings} kg CO2
            </div>
          </div>
          <div class="product-actions">
            <button class="view-details" onclick="window.location.href='/shop/${product.id}'">
              View Details
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }
  
  changeImage(index) {
    const thumbnails = this.thumbnailContainer.querySelectorAll('.thumbnail');
    thumbnails.forEach(thumb => thumb.classList.remove('active'));
    thumbnails[index].classList.add('active');
    
    const product = this.productImage.src.split('/').pop();
    const newImage = thumbnails[index].querySelector('img').src;
    this.productImage.src = newImage;
  }
  
  async addToCart() {
    try {
      const quantity = parseInt(this.quantityInput.value);
      
      const response = await fetch('/api/cart/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          productId: this.productId,
          quantity
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to add product to cart');
      }
      
      this.showSuccess('Product added to cart successfully!');
    } catch (error) {
      console.error('Error adding to cart:', error);
      this.showError('Failed to add product to cart. Please try again.');
    }
  }
  
  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger';
    errorDiv.textContent = message;
    
    const productContainer = document.querySelector('.product-container');
    productContainer.insertAdjacentElement('beforebegin', errorDiv);
    
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
  
  showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'alert alert-success';
    successDiv.textContent = message;
    
    const productContainer = document.querySelector('.product-container');
    productContainer.insertAdjacentElement('beforebegin', successDiv);
    
    setTimeout(() => {
      successDiv.remove();
    }, 5000);
  }
}

// Initialize product details when DOM is loaded
let productDetails;
document.addEventListener('DOMContentLoaded', () => {
  productDetails = new ProductDetails();
}); 