const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

dotenv.config();

const app = express();

// Constants
const JWT_SECRET = process.env.JWT_SECRET || 'MySuperSecretKey123!@#$%^&*';
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// CORS configuration
const allowedOrigins = [
  'https://swift-bags-gad3.vercel.app',
  'https://swift-bags-t1u3.vercel.app',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5500',
  'https://swift-bags.onrender.com'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin);
      callback(null, true); // Temporarily allow all for debugging
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ============= SCHEMAS =============

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  lastLogin: { type: Date },
  lastPasswordChange: { type: Date },
  sessions: [{
    token: String,
    device: String,
    lastActive: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

// Slider Schema
const sliderSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String },
  image: { type: String, required: true },
  cloudinaryId: { type: String },
  buttonText: { type: String, default: 'এখনই কিনুন' },
  productData: {
    id: String,
    name: String,
    price: Number,
    originalPrice: Number,
    discount: String,
    variantStock: Number,
    img: String
  },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Category Schema
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  nameBn: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Product Schema
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  categorySlug: String,
  price: { type: Number, required: true },
  originalPrice: { type: Number, required: true },
  variants: [{
    images: [{
      url: String,
      cloudinaryId: String,
      isPrimary: { type: Boolean, default: false }
    }],
    color: String,
    size: String,
    stock: { type: Number, default: 0 },
    sold: { type: Number, default: 0 },
    discount: String,
    rating: { type: Number, default: 4.5 }
  }],
  featured: { type: Boolean, default: false },
  trending: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Order Schema
const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customer: {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true }
  },
  items: [{
    productId: String,
    name: String,
    image: String,
    price: Number,
    originalPrice: Number,
    quantity: Number,
    variant: {
      color: String,
      size: String
    }
  }],
  subtotal: { type: Number, required: true },
  deliveryCharge: { type: Number, required: true },
  total: { type: Number, required: true },
  deliveryArea: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'cash_on_delivery'],
    default: 'cash_on_delivery'
  },
  notes: String,
  adminNotes: String,
  notified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Review Schema
const reviewSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  customerName: { type: String, required: true },
  customerAddress: { type: String, required: true },
  review: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  notified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  approvedAt: Date
});

// Site Content Schema
const contentSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  type: { type: String, enum: ['text', 'html', 'json'], default: 'text' },
  updatedAt: { type: Date, default: Date.now }
});

// Notification Schema
const notificationSchema = new mongoose.Schema({
  type: { type: String, enum: ['order', 'review', 'system'], required: true },
  title: String,
  message: String,
  data: mongoose.Schema.Types.Mixed,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Admin = mongoose.model('Admin', adminSchema);
const Slider = mongoose.model('Slider', sliderSchema);
const Category = mongoose.model('Category', categorySchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Review = mongoose.model('Review', reviewSchema);
const Content = mongoose.model('Content', contentSchema);
const Notification = mongoose.model('Notification', notificationSchema);

// ============= MIDDLEWARE =============

// Auth Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findById(decoded.userId);
    
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    const sessionExists = admin.sessions.some(s => s.token === token);
    if (!sessionExists) {
      return res.status(401).json({ success: false, message: 'Session expired' });
    }

    req.user = admin;
    req.token = token;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
};

// Multer Storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'swiftbags',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ============= DATABASE CONNECTION =============

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected Successfully');
    console.log('📊 Database:', mongoose.connection.name);
    
    // Initialize data after successful connection
    await initializeData();
    
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    // Don't exit, just retry
    setTimeout(connectDB, 5000);
  }
};

// Handle MongoDB connection events
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected. Reconnecting...');
  setTimeout(connectDB, 5000);
});

// ============= INITIAL SETUP =============

async function initializeData() {
  try {
    await createInitialAdmin();
    await createInitialCategories();
    await createInitialContent();
    console.log('✅ Initial data setup completed');
  } catch (error) {
    console.error('❌ Error in initial data setup:', error);
  }
}

async function createInitialAdmin() {
  try {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    
    // Check if admin exists
    const adminExists = await Admin.findOne({ username: adminUsername });
    
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const newAdmin = await Admin.create({
        username: adminUsername,
        password: hashedPassword,
        sessions: [],
        lastLogin: null,
        lastPasswordChange: new Date()
      });
      
      console.log('✅ Initial admin created successfully');
      console.log(`   Username: ${adminUsername}`);
      console.log(`   Password: ${adminPassword}`);
      console.log(`   Admin ID: ${newAdmin._id}`);
    } else {
      console.log('✅ Admin already exists with username:', adminExists.username);
      
      // Verify password (optional)
      const isValid = await bcrypt.compare(adminPassword, adminExists.password);
      console.log(`   Password valid: ${isValid}`);
      
      if (!isValid) {
        // Update password if it doesn't match
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        adminExists.password = hashedPassword;
        await adminExists.save();
        console.log('   Password updated to match .env');
      }
    }
  } catch (error) {
    console.error('❌ Error creating admin:', error);
  }
}

async function createInitialCategories() {
  try {
    const categories = [
      { name: 'Men', nameBn: 'পুরুষদের', slug: 'men', order: 1, active: true },
      { name: 'Women', nameBn: 'মহিলাদের', slug: 'women', order: 2, active: true },
      { name: 'Kids', nameBn: 'শিশুদের', slug: 'kids', order: 3, active: true },
      { name: 'Travel', nameBn: 'ভ্রমণ', slug: 'travel', order: 4, active: true }
    ];

    for (const cat of categories) {
      const exists = await Category.findOne({ slug: cat.slug });
      if (!exists) {
        await Category.create(cat);
        console.log(`✅ Category created: ${cat.nameBn}`);
      }
    }
  } catch (error) {
    console.error('❌ Error creating categories:', error);
  }
}

async function createInitialContent() {
  try {
    const contents = [
      { key: 'footerText', value: '© 2025 Swift Bags. সর্বস্বত্ব সংরক্ষিত।', type: 'text' },
      { key: 'address', value: '১২৩/৪, গুলশান, ঢাকা - ১২১২, বাংলাদেশ', type: 'text' },
      { key: 'phoneNumber', value: '০১৩২৬-১৯৮৪৫৬', type: 'text' },
      { key: 'email', value: 'info@swiftbags.com', type: 'text' }
    ];

    for (const content of contents) {
      const exists = await Content.findOne({ key: content.key });
      if (!exists) {
        await Content.create(content);
        console.log(`✅ Content created: ${content.key}`);
      }
    }
  } catch (error) {
    console.error('❌ Error creating content:', error);
  }
}

// ============= API ROUTES =============

// Test Routes
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is working',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Swift Bags API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    database: mongoose.connection.name || 'unknown'
  });
});

// Auth Routes
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('🔐 Login attempt:', { username, password: '***' });
    console.log('Request body:', req.body);
    console.log('Headers:', req.headers);
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    const admin = await Admin.findOne({ username });
    if (!admin) {
      console.log('❌ Admin not found:', username);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }

    console.log('Admin found:', admin.username);
    console.log('Stored password hash:', admin.password.substring(0, 20) + '...');

    const isValid = await bcrypt.compare(password, admin.password);
    console.log('Password valid:', isValid);
    
    if (!isValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }

    const token = jwt.sign(
      { userId: admin._id, username: admin.username },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    const device = req.headers['user-agent'] || 'unknown';
    admin.sessions.push({ token, device, lastActive: new Date() });
    admin.lastLogin = new Date();
    await admin.save();

    console.log('✅ Login successful:', username);

    res.json({
      success: true,
      token,
      admin: { 
        username: admin.username, 
        lastLogin: admin.lastLogin,
        id: admin._id
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
});

// Test login route (for debugging)
app.post('/api/admin/test-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('Test login attempt:', username);
    
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.json({ 
        success: false, 
        message: 'Admin not found',
        exists: false 
      });
    }

    const isValid = await bcrypt.compare(password, admin.password);
    
    res.json({ 
      success: isValid,
      message: isValid ? 'Password correct' : 'Password incorrect',
      adminExists: true,
      passwordValid: isValid,
      adminId: admin._id,
      storedHash: admin.password.substring(0, 20) + '...'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reset admin (temporary for debugging)
app.get('/api/admin/reset', async (req, res) => {
  try {
    // Delete existing admin
    await Admin.deleteMany({});
    
    // Create new admin
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    const newAdmin = await Admin.create({
      username: 'admin',
      password: hashedPassword,
      sessions: [],
      lastLogin: null,
      lastPasswordChange: new Date()
    });
    
    console.log('✅ Admin reset successful');
    
    res.json({ 
      success: true, 
      message: 'Admin reset successful',
      admin: {
        username: newAdmin.username,
        id: newAdmin._id,
        password: 'Admin@123'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/logout', authenticateToken, async (req, res) => {
  try {
    req.user.sessions = req.user.sessions.filter(s => s.token !== req.token);
    await req.user.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const isValid = await bcrypt.compare(currentPassword, req.user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    req.user.password = hashedPassword;
    req.user.lastPasswordChange = new Date();
    req.user.sessions = [];
    await req.user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Check admin route
app.get('/api/admin/check', async (req, res) => {
  try {
    const admins = await Admin.find({}).select('-password');
    const count = await Admin.countDocuments();
    
    res.json({ 
      success: true, 
      message: 'Admin check',
      totalAdmins: count,
      admins: admins.map(a => ({
        id: a._id,
        username: a.username,
        lastLogin: a.lastLogin,
        sessionCount: a.sessions.length
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Slider Routes
app.get('/api/sliders', async (req, res) => {
  try {
    const sliders = await Slider.find({ active: true }).sort({ order: 1 });
    res.json({ success: true, data: sliders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/sliders', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const sliderData = JSON.parse(req.body.data);
    const slider = new Slider({
      ...sliderData,
      image: req.file.path,
      cloudinaryId: req.file.filename
    });
    await slider.save();
    res.json({ success: true, data: slider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/sliders/:id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const slider = await Slider.findById(req.params.id);
    if (!slider) {
      return res.status(404).json({ success: false, message: 'Slider not found' });
    }

    const sliderData = JSON.parse(req.body.data);
    
    if (req.file) {
      if (slider.cloudinaryId) {
        await cloudinary.uploader.destroy(slider.cloudinaryId);
      }
      slider.image = req.file.path;
      slider.cloudinaryId = req.file.filename;
    }

    Object.assign(slider, sliderData);
    await slider.save();
    
    res.json({ success: true, data: slider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/sliders/:id', authenticateToken, async (req, res) => {
  try {
    const slider = await Slider.findById(req.params.id);
    if (!slider) {
      return res.status(404).json({ success: false, message: 'Slider not found' });
    }

    if (slider.cloudinaryId) {
      await cloudinary.uploader.destroy(slider.cloudinaryId);
    }

    await slider.deleteOne();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Category Routes
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.find({ active: true }).sort({ order: 1 });
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/categories', authenticateToken, async (req, res) => {
  try {
    const category = new Category(req.body);
    await category.save();
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/categories/:id', authenticateToken, async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/categories/:id', authenticateToken, async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Product Routes
app.get('/api/products', async (req, res) => {
  try {
    const { category } = req.query;
    let query = { active: true };
    
    if (category && category !== 'all') {
      const cat = await Category.findOne({ slug: category });
      if (cat) {
        query.category = cat._id;
      }
    }
    
    const products = await Product.find(query).populate('category').sort({ createdAt: -1 });
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/products', authenticateToken, upload.array('images', 10), async (req, res) => {
  try {
    const productData = JSON.parse(req.body.data);
    
    const variants = productData.variants || [];
    if (req.files && req.files.length > 0) {
      const images = req.files.map((file, index) => ({
        url: file.path,
        cloudinaryId: file.filename,
        isPrimary: index === 0
      }));
      
      if (variants.length === 0) {
        variants.push({ images, stock: 0, sold: 0, discount: '' });
      } else {
        variants[0].images = images;
      }
    }

    const category = await Category.findOne({ slug: productData.category });
    if (!category) {
      return res.status(400).json({ success: false, message: 'Category not found' });
    }

    const product = new Product({
      ...productData,
      category: category._id,
      categorySlug: productData.category,
      variants
    });
    
    await product.save();
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/products/:id', authenticateToken, upload.array('images', 10), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const productData = JSON.parse(req.body.data);
    
    if (req.files && req.files.length > 0) {
      // Delete old images
      for (const variant of product.variants) {
        for (const image of variant.images) {
          if (image.cloudinaryId) {
            await cloudinary.uploader.destroy(image.cloudinaryId);
          }
        }
      }
      
      const images = req.files.map((file, index) => ({
        url: file.path,
        cloudinaryId: file.filename,
        isPrimary: index === 0
      }));
      
      productData.variants = productData.variants || [];
      if (productData.variants.length === 0) {
        productData.variants.push({ images });
      } else {
        productData.variants[0].images = images;
      }
    }

    const category = await Category.findOne({ slug: productData.category });
    if (!category) {
      return res.status(400).json({ success: false, message: 'Category not found' });
    }

    productData.category = category._id;
    productData.categorySlug = productData.category;

    Object.assign(product, productData);
    product.updatedAt = new Date();
    await product.save();

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/products/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    for (const variant of product.variants) {
      for (const image of variant.images) {
        if (image.cloudinaryId) {
          await cloudinary.uploader.destroy(image.cloudinaryId);
        }
      }
    }

    await product.deleteOne();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Order Routes
app.post('/api/orders', async (req, res) => {
  try {
    const orderData = req.body;
    const orderId = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);
    
    const order = new Order({
      ...orderData,
      orderId
    });
    
    await order.save();

    await Notification.create({
      type: 'order',
      title: 'নতুন অর্ডার',
      message: `${order.customer.name} একটি নতুন অর্ডার দিয়েছেন`,
      data: { orderId: order._id }
    });

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/orders', authenticateToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Order.countDocuments(query);
    
    res.json({
      success: true,
      data: orders,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/orders/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Review Routes
app.post('/api/reviews', async (req, res) => {
  try {
    const review = new Review({
      ...req.body,
      status: 'pending'
    });
    
    await review.save();

    await Notification.create({
      type: 'review',
      title: 'নতুন রিভিউ',
      message: `${review.customerName} একটি রিভিউ দিয়েছেন`,
      data: { reviewId: review._id }
    });

    res.json({ success: true, data: review });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/reviews/approved', async (req, res) => {
  try {
    const reviews = await Review.find({ status: 'approved' }).sort({ createdAt: -1 });
    res.json({ success: true, data: reviews });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/reviews', authenticateToken, async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const reviews = await Review.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: reviews });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/reviews/:id', authenticateToken, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    
    if (req.body.status === 'approved' && review.status !== 'approved') {
      review.approvedAt = new Date();
    }
    
    Object.assign(review, req.body);
    await review.save();

    res.json({ success: true, data: review });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/reviews/:id', authenticateToken, async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Content Routes
app.get('/api/contents', async (req, res) => {
  try {
    const contents = await Content.find();
    const contentObj = {};
    contents.forEach(c => contentObj[c.key] = c.value);
    res.json({ success: true, data: contentObj });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/contents', authenticateToken, async (req, res) => {
  try {
    const { key, value, type = 'text' } = req.body;
    
    const content = await Content.findOneAndUpdate(
      { key },
      { value, type, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, data: content });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Notifications Routes
app.get('/api/admin/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Dashboard Stats
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = {
      totalOrders: await Order.countDocuments(),
      pendingOrders: await Order.countDocuments({ status: 'pending' }),
      totalProducts: await Product.countDocuments(),
      totalReviews: await Review.countDocuments(),
      pendingReviews: await Review.countDocuments({ status: 'pending' }),
      todayOrders: await Order.countDocuments({ createdAt: { $gte: today } }),
      revenue: (await Order.aggregate([
        { $match: { status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]))[0]?.total || 0
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Swift Bags API', 
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      test: '/api/test',
      admin: '/api/admin/check',
      reset: '/api/admin/reset',
      products: '/api/products',
      categories: '/api/categories',
      sliders: '/api/sliders',
      reviews: '/api/reviews/approved',
      contents: '/api/contents'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============= START SERVER =============

// Connect to database
connectDB();

// Vercel export
module.exports = app;

// For local development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Test: http://localhost:${PORT}/api/test`);
    console.log(`📍 Health: http://localhost:${PORT}/api/health`);
    console.log(`📍 Admin check: http://localhost:${PORT}/api/admin/check`);
    console.log(`📍 Reset admin: http://localhost:${PORT}/api/admin/reset`);
  });
}