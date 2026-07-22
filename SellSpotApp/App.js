const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const mysql = require('mysql2');
const app = express();

// App setup
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

// Session and flash messages
app.use(
  session({
    secret: 'sellspot-secret',
    resave: false,
    saveUninitialized: false
  })
);
app.use(flash());

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

const connection = mysql.createConnection({
    host: 'c237-hannah-mysql.mysql.database.azure.com',
    user: 'c237_027',
    password: 'c237027@2026!',
    database: 'c237_027_t2sellspot'
});


// // Temporary local data.
// // These arrays will be replaced with MySQL queries when the team database is ready.
// let users = [];
// let listings = [];
// let nextUserId = 1;
// let nextListingId = 1;

// Multer setup for listing image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/images');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

// Check whether a user is logged in
function checkAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }

  req.flash('error', 'Please log in first.');
  res.redirect('/login');
}

// Admins can manage all listings. Users can manage only their own listings.
function canManageListing(user, listing) {
  return user.role === 'admin' || user.id === listing.sellerId;
}

// Display all listings with simple search and category filtering
// Eant: search, filter and organise marketplace items
app.get('/', (req, res) => {
  const search = (req.query.search || '').trim();
  const category = req.query.category || '';
  const condition = req.query.condition || '';
  const sort = req.query.sort || 'newest';

  let sql = `
    SELECT
      item_id AS id,
      item_name AS title,
      description,
      price,
      condition_status AS \`condition\`,
      image_url AS image,
      category_id AS category,
      status,
      created_at,
      '' AS location
    FROM items
    WHERE status != 'unlisted'
  `;

  const values = [];

  // Search the item name and description
  if (search) {
    sql += ` AND (item_name LIKE ? OR description LIKE ?)`;
    values.push(`%${search}%`, `%${search}%`);
  }

  // Filter items by category
  if (category) {
    sql += ` AND category_id = ?`;
    values.push(category);
  }

  // Filter items by condition
  if (condition) {
    sql += ` AND condition_status = ?`;
    values.push(condition);
  }

  // Only allow these approved sorting options
  const sortOptions = {
    newest: 'created_at DESC',
    oldest: 'created_at ASC',
    priceLow: 'price ASC',
    priceHigh: 'price DESC',
    nameAZ: 'item_name ASC'
  };

  sql += ` ORDER BY ${sortOptions[sort] || sortOptions.newest}`;

  connection.query(sql, values, (error, results) => {
    if (error) {
      console.error('Search and filter error:', error);
      return res.status(500).send('Database error');
    }

    res.render('index', {
      listings: results,
      search: search,
      category: category,
      condition: condition,
      sort: sort
    });

  });
});

// mag
// Display all marketplace items
app.get('/item', (req, res) => {
  const sql = `
    SELECT
      item_id AS id,
      item_name AS title,
      description,
      price,
      condition_status AS \`condition\`,
      image_url AS image,
      category_id AS category,
      status,
      created_at
    FROM items
    WHERE status != 'unlisted'
    ORDER BY created_at DESC
  `;

  connection.query(sql, (error, results) => {
    if (error) {
      console.error('Error retrieving items:', error);
      return res.status(500).send('Database error');
    }

    res.render('item', {
      items: results
    });
  });
});


// eant 
// Display one listing
app.get('/listing/:id', (req, res) => {
  const listingId = parseInt(req.params.id);
  const listing = listings.find((item) => item.id === listingId);

  if (listing) {
    res.render('listing', { listing: listing });
  } else {
    res.send('Listing not found');
  }
});

// Display registration form
app.get('/register', (req, res) => {
  res.render('register');
});

// Create a local account
app.post('/register', (req, res) => {
  const { name, email, password, role } = req.body;
  const existingUser = users.find((user) => user.email === email);

  if (existingUser) {
    req.flash('error', 'This email or login name is already used.');
    return res.redirect('/register');
  }

  const newUser = {
    id: nextUserId,
    name: name,
    email: email,
    password: password,
    role: role === 'admin' ? 'admin' : 'user'
  };

  users.push(newUser);
  nextUserId++;

  req.session.user = {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role
  };

  req.flash('success', 'Account created successfully.');
  res.redirect('/');
});

// Display login form
app.get('/login', (req, res) => {
  res.render('login');
});

// Log in using temporary local account data
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find((item) => item.email === email && item.password === password);

  if (!user) {
    req.flash('error', 'Email/login or password is incorrect.');
    return res.redirect('/login');
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };

  req.flash('success', 'Login successful.');
  res.redirect('/');
});

// Log out
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Display add listing form
app.get('/addListing', checkAuthenticated, (req, res) => {
  res.render('addListing');
});

// Add new listing to temporary local data
app.post('/addListing', checkAuthenticated, upload.single('image'), (req, res) => {
  const { title, description, price, category, condition, location } = req.body;
  const image = req.file ? req.file.filename : '';

  const newListing = {
    id: nextListingId,
    title: title,
    description: description,
    price: price,
    category: category,
    condition: condition,
    location: location,
    image: image,
    sellerId: req.session.user.id,
    sellerName: req.session.user.name
  };

  listings.push(newListing);
  nextListingId++;

  req.flash('success', 'Listing added successfully.');
  res.redirect('/');
});

// Display listings managed by the current user
app.get('/myListings', checkAuthenticated, (req, res) => {
  let results;

  if (req.session.user.role === 'admin') {
    results = listings;
  } else {
    results = listings.filter((listing) => listing.sellerId === req.session.user.id);
  }

  res.render('myListings', { listings: results });
});

// Display edit listing form
// Display edit listing form
app.get('/editListing/:id', checkAuthenticated, (req, res) => {
  const listingId = Number.parseInt(req.params.id, 10);
  const listing = listings.find((item) => item.id === listingId);

  if (!listing) {
    return res.status(404).send('Listing not found');
  }

  if (!canManageListing(req.session.user, listing)) {
    req.flash('error', 'You cannot edit this listing.');
    return res.redirect('/');
  }

  res.render('editListing', { listing });
});

// Update listing
app.post(
  '/editListing/:id',
  checkAuthenticated,
  upload.single('image'),
  (req, res) => {
    const listingId = Number.parseInt(req.params.id, 10);
    const listing = listings.find((item) => item.id === listingId);

    if (!listing) {
      return res.status(404).send('Listing not found');
    }

    if (!canManageListing(req.session.user, listing)) {
      req.flash('error', 'You cannot edit this listing.');
      return res.redirect('/');
    }

    const {
      title,
      description,
      price,
      category,
      condition,
      location
    } = req.body;

    listing.title = title;
    listing.description = description;
    listing.price = price;
    listing.category = category;
    listing.condition = condition;
    listing.location = location;

    if (req.file) {
      listing.image = req.file.filename;
    }

    req.flash('success', 'Listing updated successfully.');
    return res.redirect('/listing/' + listing.id);
  }
);

// Delete listing
app.get('/deleteListing/:id', checkAuthenticated, (req, res) => {
  const listingId = Number.parseInt(req.params.id, 10);
  const listingIndex = listings.findIndex(
    (item) => item.id === listingId
  );

  if (listingIndex === -1) {
    return res.status(404).send('Listing not found');
  }

  const listing = listings[listingIndex];

  if (!canManageListing(req.session.user, listing)) {
    req.flash('error', 'You cannot delete this listing.');
    return res.redirect('/');
  }

  listings.splice(listingIndex, 1);

  req.flash('success', 'Listing deleted successfully.');
  return res.redirect('/myListings');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SellSpot started on http://localhost:${PORT}`);
});

