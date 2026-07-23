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
    secret: 'secret',
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

// Keep the existing disk uploader for other teammates' routes
const upload = multer({
  storage: storage
});

// Use memory storage only for the Add Listing feature
const addListingUpload = multer({
  storage: multer.memoryStorage()
});

// Check whether a user is logged in
function checkAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }

  req.flash('error', 'Please log in first.');
  res.redirect('/login');
}

// LETTYAR [Check if user is admin]
function checkAdmin(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Please log in first.');
    return res.redirect('/login');
  }

  if (req.session.user.role !== 'admin') {
    req.flash('error', 'You do not have permission to access the admin board.');
    return res.redirect('/');
  }

  next();
}

// Admins can manage all listings. Users can manage only their own listings.
function canManageListing(user, listing) {
  return user.role === 'admin' || user.id === listing.sellerId;
}

// LETTYAR [Route to Admin Board]
app.get('/adminboard', checkAdmin, (req, res) => {
  res.render('adminboard');
});

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
    (image_data IS NOT NULL) AS hasDatabaseImage,
    category_id AS category,
    location,
    status,
    created_at
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

// LETTYAR [ REGISTRATION ]
function validateRegistration(req, res, next) {
    const { email, password, full_name, role } = req.body;

    if (!email || !password || !full_name) {
        req.flash('error', 'All fields are required.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
}

// mag
// Display one listing
// Display one listing
app.get('/listing/:id', (req, res) => {
  const listingId = parseInt(req.params.id);

  const sql = `
    SELECT
      items.item_id AS id,
      items.item_name AS title,
      items.description,
      items.price,
      items.condition_status AS \`condition\`,
      items.image_url AS image,
      (items.image_data IS NOT NULL) AS hasDatabaseImage,
      items.category_id AS category,
      items.location AS location,
      items.status,
      items.created_by AS sellerId,
      items.created_at,
      users.full_name AS sellerName
    FROM items
    JOIN users ON items.created_by = users.user_id
    WHERE items.item_id = ?
  `;

  connection.query(sql, [listingId], (error, results) => {
    if (error) {
      console.error('Error retrieving listing:', error);
      return res.status(500).send('Database error');
    }

    if (results.length === 0) {
      return res.status(404).send('Listing not found');
    }

    res.render('listing', {
      listing: results[0]
    });
  });
});



// Create a local account
app.post('/register', validateRegistration, (req, res) => {
    const { email, password, full_name} = req.body;
    const role = 'user';
    const checkSql = 'SELECT * FROM users WHERE email = ?';

    connection.query(checkSql, [email], (checkError, checkResults) => {
        if (checkError) {
            throw checkError;
        }

        if (checkResults.length > 0) {
            req.flash('error', 'Email already exists.');
            req.flash('formData', req.body);
            return res.redirect('/register');
        }

        const sql = 'INSERT INTO users (email, password, full_name, role, rating) VALUES (?, SHA2(?, 256), ?, ?, ?)';

        connection.query(sql, [email, password, full_name, role, 0], (err, result) => {
            if (err) {
                throw err;
            }

            console.log(result);
            req.flash('success', 'Registration successful! Please log in.');
            res.redirect('/login');
        });
    });
});

// Display login form
app.get('/login', (req, res) => {
  res.render('login');
});

// LETTYAR [ LOGIN ]
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'Email and password are required.');
        return res.redirect('/login');
    }

    const sql = `
        SELECT user_id, email, full_name, role, rating
        FROM users
        WHERE email = ? AND password = SHA2(?, 256)
    `;

    connection.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length === 0) {
            req.flash('error', 'Email or password is incorrect.');
            return res.redirect('/login');
        }

        const user = results[0];

        req.session.user = {
            id: user.user_id,
            name: user.full_name,
            email: user.email,
            role: user.role
        };

        req.flash('success', 'Login successful.');
        res.redirect('/');
    });
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

// Add new listing and image to MySQL
app.post(
  '/addListing',
  checkAuthenticated,
  addListingUpload.single('image'),
  (req, res) => {
    const {
      title,
      description,
      price,
      category,
      condition,
      location
    } = req.body;

    const imageData = req.file ? req.file.buffer : null;
    const imageType = req.file ? req.file.mimetype : null;

    const sql = `
      INSERT INTO items
      (
        item_name,
        description,
        price,
        condition_status,
        image_data,
        image_type,
        category_id,
        location,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      title,
      description,
      price,
      condition,
      imageData,
      imageType,
      category,
      location,
      req.session.user.id
    ];

    connection.query(sql, values, (error, result) => {
      if (error) {
        console.error('Error adding item:', error);
        req.flash('error', 'Unable to add listing.');
        return res.redirect('/addListing');
      }

      req.flash('success', 'Listing added successfully.');
      return res.redirect('/');
    });
  }
);

// Display an item image stored in MySQL
app.get('/itemImage/:id', (req, res) => {
  const itemId = req.params.id;

  const sql = `
    SELECT image_data, image_type
    FROM items
    WHERE item_id = ?
  `;

  connection.query(sql, [itemId], (error, results) => {
    if (error) {
      console.error('Error retrieving image:', error);
      return res.status(500).send('Database error');
    }

    if (
      results.length === 0 ||
      !results[0].image_data
    ) {
      return res.status(404).send('Image not found');
    }

    res.set('Content-Type', results[0].image_type);
    return res.send(results[0].image_data);
  });
});

// Display listings managed by the current user
app.get('/myListings', checkAuthenticated, (req, res) => {
const sql = `
  SELECT
    items.item_id AS id,
    items.item_name AS title,
    items.description,
    items.price,
    items.condition_status AS \`condition\`,
    items.image_url AS image,
    (items.image_data IS NOT NULL) AS hasDatabaseImage,
    items.category_id AS category,
    items.location AS location,
    items.status,
    items.created_by AS sellerId,
    items.created_at,
    users.full_name AS sellerName
  FROM items
  JOIN users ON items.created_by = users.user_id
  WHERE items.item_id = ?
`;

  connection.query(sql, [req.session.user.id], (error, results) => {
    if (error) {
      console.error('Error retrieving my listings:', error);
      return res.status(500).send('Database error');
    }

    res.render('myListings', {
      listings: results
    });
  });
});


// Show Edit Listing Page (GET) Gurjeet
app.get('/editListing/:id', checkAuthenticated, (req, res) => {

    // Get the listing ID from the URL
    const id = parseInt(req.params.id);

    // Get the listing from the database
    const sql = `
        SELECT *
        FROM items
        WHERE item_id = ?
    `;

    connection.query(sql, [id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database Error");
        }
        // Check if listing exists
        if (results.length === 0) {
            return res.status(404).send("Listing not found.");
        }
        const currentListing = results[0];
        // Check if the user owns the listing or is an admin
        if (!canManageListing(req.session.user, {
            sellerId: currentListing.created_by
        })) {
            req.flash("error", "You do not have permission to edit this listing.");
            return res.redirect("/");
        }
        // Open the edit page
        res.render("editListing", {
            listing: currentListing
        });
    });
});

// Update Listing (POST) Gurjeet
app.post('/editListing/:id', checkAuthenticated, addListingUpload.single('image'), (req, res) => {

    const id = parseInt(req.params.id);

    // Check if listing exists
    connection.query(
        "SELECT * FROM items WHERE item_id = ?",
        [id],
        (err, results) => {

            if (err) {
                console.error(err);
                return res.status(500).send("Database Error");
            }

            if (results.length === 0) {
                return res.status(404).send("Listing not found.");
            }

            const currentListing = results[0];

            // Permission check
            if (!canManageListing(req.session.user, {
                sellerId: currentListing.created_by
            })) {
                req.flash("error", "You do not have permission to edit this listing.");
                return res.redirect("/");
            }

            const {
                title,
                description,
                price,
                category,
                condition
            } = req.body;

            // If a new image is uploaded
            if (req.file) {

                const updateSql = `
                    UPDATE items
                    SET
                        item_name = ?,
                        description = ?,
                        price = ?,
                        category_id = ?,
                        condition_status = ?,
                        image_data = ?,
                        image_type = ?
                    WHERE item_id = ?
                `;

                connection.query(
                    updateSql,
                    [
                        title,
                        description,
                        price,
                        category,
                        condition,
                        req.file.buffer,
                        req.file.mimetype,
                        id
                    ],
                    (err) => {

                        if (err) {
                            console.error(err);
                            return res.status(500).send("Database Error");
                        }

                        req.flash("success", "Listing updated successfully!");
                        res.redirect(`/listing/${id}`);
                    }
                );

            } else {

                // Update without changing image
                const updateSql = `
                    UPDATE items
                    SET
                        item_name = ?,
                        description = ?,
                        price = ?,
                        category_id = ?,
                        condition_status = ?
                    WHERE item_id = ?
                `;

                connection.query(
                    updateSql,
                    [
                        title,
                        description,
                        price,
                        category,
                        condition,
                        id
                    ],
                    (err) => {

                        if (err) {
                            console.error(err);
                            return res.status(500).send("Database Error");
                        }

                        req.flash("success", "Listing updated successfully!");
                        res.redirect(`/listing/${id}`);
                    }
                );
            }
        }
    );
});

//Zuo Jing
// Delete listing
app.get('/deleteListing/:id', checkAuthenticated, (req, res) => {
  const listingId = Number.parseInt(req.params.id, 10);

  const checkSql = 'SELECT * FROM items WHERE item_id = ?';
  
  connection.query(checkSql, [listingId], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      req.flash('error', 'Database error occurred.');
      return res.redirect('/');
    }

    if (results.length === 0) {
      req.flash('error', 'Listing not found.');
      return res.redirect('/');
    }

    const listing = results[0];
    const currentUser = req.session.user;

    if (currentUser.role !== 'admin' && currentUser.user_id !== listing.created_by) {
      req.flash('error', 'You do not have permission to delete this listing.');
      return res.redirect('/');
    }

    const deleteSql = 'DELETE FROM items WHERE item_id = ?';
    
    connection.query(deleteSql, [listingId], (err, result) => {
      if (err) {
        console.error('Delete error:', err);
        req.flash('error', 'Failed to delete listing.');
        return res.redirect('/');
      }

      req.flash('success', 'Listing deleted successfully.');
      return res.redirect('/');
    });
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SellSpot started on http://localhost:${PORT}`);
});
