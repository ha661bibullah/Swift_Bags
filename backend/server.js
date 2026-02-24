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

dotenv.config();

const app = express();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: ['http://localhost:5000', 'http://127.0.0.1:5500', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Connected'))
.catch(err => console.log('MongoDB Connection Error:', err));

// ============= SCHEMAS =============

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  lastLogin: { type: Date },
  lastPasswordChange: { type: Date },
  sessions: [{ token: String, device: String, lastActive: Date }]
});

// Slider Schema
const sliderSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String },
  image: { type: String, required: true },
  cloudinaryId: { type: String },
  buttonText: { type: String, default: 'এখনই কিনুন' },
  productData: {
    id: Number,
    name: String,
    price: Number,
    originalPrice: Number,
    discount: String,
    variantStock: Number
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
    rating: { type: Number, default: 4.5 },
    reviews: [{ text: String, rating: Number }]
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
    productId: mongoose.Schema.Types.ObjectId,
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.userId);
    
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    // Check if session exists
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

// ============= INITIAL SETUP =============

async function createInitialAdmin() {
  try {
    const adminExists = await Admin.findOne({ username: process.env.ADMIN_USERNAME });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      await Admin.create({
        username: process.env.ADMIN_USERNAME,
        password: hashedPassword
      });
      console.log('Initial admin created');
    }
  } catch (error) {
    console.error('Error creating admin:', error);
  }
}

async function createInitialCategories() {
  try {
    const categories = [
      { name: 'Men', nameBn: 'পুরুষদের', slug: 'men', order: 1 },
      { name: 'Women', nameBn: 'মহিলাদের', slug: 'women', order: 2 }
    ];

    for (const cat of categories) {
      const exists = await Category.findOne({ slug: cat.slug });
      if (!exists) {
        await Category.create(cat);
      }
    }
    console.log('Initial categories created');
  } catch (error) {
    console.error('Error creating categories:', error);
  }
}

createInitialAdmin();
createInitialCategories();

// ============= API ROUTES =============

// Auth Routes
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: admin._id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    const device = req.headers['user-agent'] || 'unknown';
    admin.sessions.push({ token, device, lastActive: new Date() });
    admin.lastLogin = new Date();
    await admin.save();

    res.json({
      success: true,
      token,
      admin: { username: admin.username, lastLogin: admin.lastLogin }
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
    req.user.sessions = []; // Clear all sessions
    await req.user.save();

    res.json({ success: true, message: 'Password changed successfully' });
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
      // Delete old image from cloudinary
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

    // Delete image from cloudinary
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
    
    // Process images
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

    // Delete images from cloudinary
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

    // Create notification
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
    
    if (status) {
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
      page,
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

    // Create notification
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
    
    if (status) {
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
      revenue: await Order.aggregate([
        { $match: { status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ])
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});