class Shop {
  constructor() {
    this.productsContainer = document.querySelector('#products-container');
    this.searchInput = document.querySelector('#search-input');
    this.searchButton = document.querySelector('#search-button');
    this.categoryFilter = document.querySelector('#category-filter');
    this.impactFilter = document.querySelector('#impact-filter');
    this.priceFilter = document.querySelector('#price-filter');
    this.prevPageButton = document.querySelector('#prev-page');
    this.nextPageButton = document.querySelector('#next-page');
    this.pageInfo = document.querySelector('#page-info');
    
    this.currentPage = 1;
    this.itemsPerPage = 12;
    this.totalPages = 1;
    this.filters = {
      search: '',
      category: '',
      impact: '',
      price: ''
    };
    
    this.init();
  }
  
  init() {
    this.setupEventListeners();
    this.loadProducts();
  }
  
  setupEventListeners() {
    // Search
    this.searchButton.addEventListener('click', () => {
      this.filters.search = this.searchInput.value.trim();
      this.currentPage = 1;
      this.loadProducts();
    });
    
    this.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.filters.search = this.searchInput.value.trim();
        this.currentPage = 1;
        this.loadProducts();
      }
    });
    
    // Filters
    this.categoryFilter.addEventListener('change', () => {
      this.filters.category = this.categoryFilter.value;
      this.currentPage = 1;
      this.loadProducts();
    });
    
    this.impactFilter.addEventListener('change', () => {
      this.filters.impact = this.impactFilter.value;
      this.currentPage = 1;
      this.loadProducts();
    });
    
    this.priceFilter.addEventListener('change', () => {
      this.filters.price = this.priceFilter.value;
      this.currentPage = 1;
      this.loadProducts();
    });
    
    // Pagination
    this.prevPageButton.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.loadProducts();
      }
    });
    
    this.nextPageButton.addEventListener('click', () => {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        this.loadProducts();
      }
    });
  }
  
  async loadProducts() {
    try {
      const queryParams = new URLSearchParams({
        page: this.currentPage,
        limit: this.itemsPerPage,
        ...this.filters
      });
      
      const response = await fetch(`/api/products?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load products');
      }
      
      const data = await response.json();
      this.totalPages = Math.ceil(data.total / this.itemsPerPage);
      
      this.updatePagination();
      this.renderProducts(data.products);
    } catch (error) {
      console.error('Error loading products:', error);
      this.showError('Failed to load products. Please try again later.');
    }
  }
  
  updatePagination() {
    this.pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
    this.prevPageButton.disabled = this.currentPage === 1;
    this.nextPageButton.disabled = this.currentPage === this.totalPages;
  }
  
  renderProducts(products) {
    this.productsContainer.innerHTML = products.map(product => `
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
            <button class="add-to-cart" onclick="shop.addToCart('${product.id}')">
              Add to Cart
            </button>
            <button class="view-details" onclick="shop.viewProductDetails('${product.id}')">
              View Details
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }
  
  async addToCart(productId) {
    try {
      const response = await fetch('/api/cart/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ productId })
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
  
  viewProductDetails(productId) {
    window.location.href = `/shop/${productId}`;
  }
  
  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger';
    errorDiv.textContent = message;
    
    const shopHeader = document.querySelector('.shop-header');
    shopHeader.insertAdjacentElement('afterend', errorDiv);
    
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
  
  showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'alert alert-success';
    successDiv.textContent = message;
    
    const shopHeader = document.querySelector('.shop-header');
    shopHeader.insertAdjacentElement('afterend', successDiv);
    
    setTimeout(() => {
      successDiv.remove();
    }, 5000);
  }
}

// Initialize shop when DOM is loaded
let shop;
document.addEventListener('DOMContentLoaded', () => {
  shop = new Shop();
}); 