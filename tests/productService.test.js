const ProductService = require('../src/services/productService');
const redis = require('../src/config/redis');
const Airtable = require('airtable');
const logger = require('../src/services/logger');

// Mock Redis
jest.mock('../src/config/redis', () => ({
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  flushall: jest.fn()
}));

// Mock Airtable
jest.mock('airtable', () => ({
  base: jest.fn().mockReturnValue({
    table: jest.fn().mockReturnValue({
      create: jest.fn(),
      select: jest.fn().mockReturnValue({
        filterByFormula: jest.fn().mockReturnThis(),
        firstPage: jest.fn()
      }),
      update: jest.fn(),
      destroy: jest.fn()
    })
  })
}));

// Mock logger
jest.mock('../src/services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('ProductService', () => {
  let productService;
  let mockAirtable;

  beforeEach(() => {
    productService = new ProductService();
    mockAirtable = Airtable.base().table('Products');
    jest.clearAllMocks();
  });

  describe('createProduct', () => {
    it('should create a product successfully', async () => {
      const mockProduct = {
        id: 'rec123',
        fields: {
          name: 'Eco-Friendly Water Bottle',
          description: 'A reusable water bottle made from recycled materials',
          price: 29.99,
          category: 'accessories',
          stock: 100,
          co2Impact: 2.5
        }
      };

      mockAirtable.create.mockResolvedValue(mockProduct);

      const result = await productService.createProduct({
        name: 'Eco-Friendly Water Bottle',
        description: 'A reusable water bottle made from recycled materials',
        price: 29.99,
        category: 'accessories',
        stock: 100,
        co2Impact: 2.5
      });

      expect(result).toEqual(mockProduct);
      expect(mockAirtable.create).toHaveBeenCalledWith({
        name: 'Eco-Friendly Water Bottle',
        description: 'A reusable water bottle made from recycled materials',
        price: 29.99,
        category: 'accessories',
        stock: 100,
        co2Impact: 2.5
      });
      expect(redis.del).toHaveBeenCalledWith('products:all');
    });

    it('should throw error for missing name', async () => {
      await expect(productService.createProduct({
        description: 'A reusable water bottle made from recycled materials',
        price: 29.99,
        category: 'accessories',
        stock: 100,
        co2Impact: 2.5
      })).rejects.toThrow('Product name is required');
    });

    it('should throw error for missing description', async () => {
      await expect(productService.createProduct({
        name: 'Eco-Friendly Water Bottle',
        price: 29.99,
        category: 'accessories',
        stock: 100,
        co2Impact: 2.5
      })).rejects.toThrow('Product description is required');
    });

    it('should throw error for missing price', async () => {
      await expect(productService.createProduct({
        name: 'Eco-Friendly Water Bottle',
        description: 'A reusable water bottle made from recycled materials',
        category: 'accessories',
        stock: 100,
        co2Impact: 2.5
      })).rejects.toThrow('Product price is required');
    });

    it('should throw error for missing category', async () => {
      await expect(productService.createProduct({
        name: 'Eco-Friendly Water Bottle',
        description: 'A reusable water bottle made from recycled materials',
        price: 29.99,
        stock: 100,
        co2Impact: 2.5
      })).rejects.toThrow('Product category is required');
    });

    it('should throw error for missing stock', async () => {
      await expect(productService.createProduct({
        name: 'Eco-Friendly Water Bottle',
        description: 'A reusable water bottle made from recycled materials',
        price: 29.99,
        category: 'accessories',
        co2Impact: 2.5
      })).rejects.toThrow('Product stock is required');
    });

    it('should throw error for missing co2Impact', async () => {
      await expect(productService.createProduct({
        name: 'Eco-Friendly Water Bottle',
        description: 'A reusable water bottle made from recycled materials',
        price: 29.99,
        category: 'accessories',
        stock: 100
      })).rejects.toThrow('Product CO2 impact is required');
    });

    it('should handle Airtable errors gracefully', async () => {
      mockAirtable.create.mockRejectedValue(new Error('Airtable error'));

      await expect(productService.createProduct({
        name: 'Eco-Friendly Water Bottle',
        description: 'A reusable water bottle made from recycled materials',
        price: 29.99,
        category: 'accessories',
        stock: 100,
        co2Impact: 2.5
      })).rejects.toThrow('Airtable error');
    });
  });

  describe('getProducts', () => {
    it('should get products from cache if available', async () => {
      const mockProducts = [
        {
          id: 'rec123',
          fields: {
            name: 'Eco-Friendly Water Bottle',
            description: 'A reusable water bottle made from recycled materials',
            price: 29.99,
            category: 'accessories',
            stock: 100,
            co2Impact: 2.5
          }
        }
      ];

      redis.get.mockResolvedValue(JSON.stringify(mockProducts));

      const result = await productService.getProducts();

      expect(result).toEqual(mockProducts);
      expect(redis.get).toHaveBeenCalledWith('products:all');
      expect(mockAirtable.select).not.toHaveBeenCalled();
    });

    it('should get products from Airtable if not in cache', async () => {
      const mockProducts = [
        {
          id: 'rec123',
          fields: {
            name: 'Eco-Friendly Water Bottle',
            description: 'A reusable water bottle made from recycled materials',
            price: 29.99,
            category: 'accessories',
            stock: 100,
            co2Impact: 2.5
          }
        }
      ];

      redis.get.mockResolvedValue(null);
      mockAirtable.select().firstPage.mockResolvedValue(mockProducts);

      const result = await productService.getProducts();

      expect(result).toEqual(mockProducts);
      expect(redis.get).toHaveBeenCalledWith('products:all');
      expect(mockAirtable.select).toHaveBeenCalled();
      expect(redis.setex).toHaveBeenCalledWith(
        'products:all',
        3600,
        JSON.stringify(mockProducts)
      );
    });

    it('should handle Airtable errors gracefully', async () => {
      redis.get.mockResolvedValue(null);
      mockAirtable.select().firstPage.mockRejectedValue(new Error('Airtable error'));

      await expect(productService.getProducts())
        .rejects.toThrow('Airtable error');
    });
  });

  describe('getProduct', () => {
    it('should get product from cache if available', async () => {
      const mockProduct = {
        id: 'rec123',
        fields: {
          name: 'Eco-Friendly Water Bottle',
          description: 'A reusable water bottle made from recycled materials',
          price: 29.99,
          category: 'accessories',
          stock: 100,
          co2Impact: 2.5
        }
      };

      redis.get.mockResolvedValue(JSON.stringify(mockProduct));

      const result = await productService.getProduct('rec123');

      expect(result).toEqual(mockProduct);
      expect(redis.get).toHaveBeenCalledWith('products:rec123');
      expect(mockAirtable.select).not.toHaveBeenCalled();
    });

    it('should get product from Airtable if not in cache', async () => {
      const mockProduct = {
        id: 'rec123',
        fields: {
          name: 'Eco-Friendly Water Bottle',
          description: 'A reusable water bottle made from recycled materials',
          price: 29.99,
          category: 'accessories',
          stock: 100,
          co2Impact: 2.5
        }
      };

      redis.get.mockResolvedValue(null);
      mockAirtable.select().firstPage.mockResolvedValue([mockProduct]);

      const result = await productService.getProduct('rec123');

      expect(result).toEqual(mockProduct);
      expect(redis.get).toHaveBeenCalledWith('products:rec123');
      expect(mockAirtable.select).toHaveBeenCalled();
      expect(mockAirtable.select().filterByFormula).toHaveBeenCalledWith(
        "{id} = 'rec123'"
      );
      expect(redis.setex).toHaveBeenCalledWith(
        'products:rec123',
        3600,
        JSON.stringify(mockProduct)
      );
    });

    it('should throw error for missing productId', async () => {
      await expect(productService.getProduct(null))
        .rejects.toThrow('Product ID is required');
    });

    it('should throw error for non-existent product', async () => {
      redis.get.mockResolvedValue(null);
      mockAirtable.select().firstPage.mockResolvedValue([]);

      await expect(productService.getProduct('rec123'))
        .rejects.toThrow('Product not found');
    });

    it('should handle Airtable errors gracefully', async () => {
      redis.get.mockResolvedValue(null);
      mockAirtable.select().firstPage.mockRejectedValue(new Error('Airtable error'));

      await expect(productService.getProduct('rec123'))
        .rejects.toThrow('Airtable error');
    });
  });

  describe('updateProduct', () => {
    it('should update product successfully', async () => {
      const mockProduct = {
        id: 'rec123',
        fields: {
          name: 'Eco-Friendly Water Bottle',
          description: 'A reusable water bottle made from recycled materials',
          price: 29.99,
          category: 'accessories',
          stock: 100,
          co2Impact: 2.5
        }
      };

      mockAirtable.select().firstPage.mockResolvedValue([mockProduct]);
      mockAirtable.update.mockResolvedValue({
        ...mockProduct,
        fields: {
          ...mockProduct.fields,
          price: 24.99,
          stock: 90
        }
      });

      const result = await productService.updateProduct('rec123', {
        price: 24.99,
        stock: 90
      });

      expect(result.fields.price).toBe(24.99);
      expect(result.fields.stock).toBe(90);
      expect(mockAirtable.update).toHaveBeenCalledWith('rec123', {
        price: 24.99,
        stock: 90
      });
      expect(redis.del).toHaveBeenCalledWith('products:rec123');
      expect(redis.del).toHaveBeenCalledWith('products:all');
    });

    it('should throw error for missing productId', async () => {
      await expect(productService.updateProduct(null, {
        price: 24.99,
        stock: 90
      })).rejects.toThrow('Product ID is required');
    });

    it('should throw error for non-existent product', async () => {
      mockAirtable.select().firstPage.mockResolvedValue([]);

      await expect(productService.updateProduct('rec123', {
        price: 24.99,
        stock: 90
      })).rejects.toThrow('Product not found');
    });

    it('should handle Airtable errors gracefully', async () => {
      const mockProduct = {
        id: 'rec123',
        fields: {
          name: 'Eco-Friendly Water Bottle',
          description: 'A reusable water bottle made from recycled materials',
          price: 29.99,
          category: 'accessories',
          stock: 100,
          co2Impact: 2.5
        }
      };

      mockAirtable.select().firstPage.mockResolvedValue([mockProduct]);
      mockAirtable.update.mockRejectedValue(new Error('Airtable error'));

      await expect(productService.updateProduct('rec123', {
        price: 24.99,
        stock: 90
      })).rejects.toThrow('Airtable error');
    });
  });

  describe('deleteProduct', () => {
    it('should delete product successfully', async () => {
      const mockProduct = {
        id: 'rec123',
        fields: {
          name: 'Eco-Friendly Water Bottle',
          description: 'A reusable water bottle made from recycled materials',
          price: 29.99,
          category: 'accessories',
          stock: 100,
          co2Impact: 2.5
        }
      };

      mockAirtable.select().firstPage.mockResolvedValue([mockProduct]);
      mockAirtable.destroy.mockResolvedValue(mockProduct);

      const result = await productService.deleteProduct('rec123');

      expect(result).toEqual(mockProduct);
      expect(mockAirtable.destroy).toHaveBeenCalledWith('rec123');
      expect(redis.del).toHaveBeenCalledWith('products:rec123');
      expect(redis.del).toHaveBeenCalledWith('products:all');
    });

    it('should throw error for missing productId', async () => {
      await expect(productService.deleteProduct(null))
        .rejects.toThrow('Product ID is required');
    });

    it('should throw error for non-existent product', async () => {
      mockAirtable.select().firstPage.mockResolvedValue([]);

      await expect(productService.deleteProduct('rec123'))
        .rejects.toThrow('Product not found');
    });

    it('should handle Airtable errors gracefully', async () => {
      const mockProduct = {
        id: 'rec123',
        fields: {
          name: 'Eco-Friendly Water Bottle',
          description: 'A reusable water bottle made from recycled materials',
          price: 29.99,
          category: 'accessories',
          stock: 100,
          co2Impact: 2.5
        }
      };

      mockAirtable.select().firstPage.mockResolvedValue([mockProduct]);
      mockAirtable.destroy.mockRejectedValue(new Error('Airtable error'));

      await expect(productService.deleteProduct('rec123'))
        .rejects.toThrow('Airtable error');
    });
  });
}); 