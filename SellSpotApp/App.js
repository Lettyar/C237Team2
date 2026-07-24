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

connection.query(`
  CREATE TABLE IF NOT EXISTS reviews (
    review_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    rating INT NOT NULL,
    comment TEXT,
    review_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT fk_reviews_item FOREIGN KEY (item_id) REFERENCES items(item_id),
    CONSTRAINT fk_reviews_reviewer FOREIGN KEY (review_by) REFERENCES users(user_id)
  )
`, (error) => {
  if (error) {
    console.error('Error creating reviews table:', error);
  }
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

function updateUserAverageRating(userId, callback) {
  const averageSql = 'SELECT AVG(rating) AS averageRating FROM reviews WHERE user_id = ?';

  connection.query(averageSql, [userId], (error, results) => {
    if (error) {
      return callback(error);
    }

    const averageRating = results[0].averageRating !== null
      ? Number(results[0].averageRating).toFixed(1)
      : '0.0';

    const updateSql = 'UPDATE users SET rating = ? WHERE user_id = ?';

    connection.query(updateSql, [averageRating, userId], (updateError) => {
      callback(updateError);
    });
  });
}

function getUserRatings(callback) {
  const sql = `
    SELECT
      user_id,
      full_name,
      email,
      role,
      rating
    FROM users
    WHERE role = 'user'
    ORDER BY full_name ASC
  `;

  connection.query(sql, (error, users) => {
    if (error) {
      return callback(error, null);
    }

    const reviewSql = `
      SELECT user_id, AVG(rating) AS averageRating
      FROM reviews
      GROUP BY user_id
    `;

    connection.query(reviewSql, (reviewError, reviewResults) => {
      if (reviewError) {
        return callback(reviewError, null);
      }

      const reviewMap = {};
      reviewResults.forEach((review) => {
        reviewMap[review.user_id] = Number(review.averageRating).toFixed(1);
      });

      const updatedUsers = users.map((user) => ({
        ...user,
        rating: reviewMap[user.user_id] || user.rating || '0.0'
      }));

      callback(null, updatedUsers);
    });
  });
}

app.get('/ratings', checkAuthenticated, (req, res) => {
  const search = (req.query.search || '').trim();
  const values = [req.session.user.id];

  let sql = `
    SELECT
      user_id,
      full_name,
      email,
      role,
      rating
    FROM users
    WHERE user_id != ?
      AND role = 'user'
  `;

  if (search) {
    sql += ` AND full_name LIKE ?`;
    values.push(`%${search}%`);
  }

  sql += ` ORDER BY full_name ASC`;

  connection.query(sql, values, (error, users) => {
    if (error) {
      console.error('Error searching users for ratings:', error);
      return res.status(500).send('Database error');
    }

    const reviewSql = `
      SELECT user_id, AVG(rating) AS averageRating
      FROM reviews
      GROUP BY user_id
    `;

    connection.query(reviewSql, (reviewError, reviewResults) => {
      if (reviewError) {
        console.error('Error loading review averages:', reviewError);
        return res.status(500).send('Database error');
      }

      const reviewMap = {};
      reviewResults.forEach((review) => {
        reviewMap[review.user_id] = Number(review.averageRating).toFixed(1);
      });

      const ratedUsers = users.map((user) => ({
        ...user,
        rating: reviewMap[user.user_id] || user.rating || '0.0'
      }));

      if (ratedUsers.length === 0) {
        return res.render('ratings', {
          users: [],
          search: search,
          userListings: {}
        });
      }

      const userIds = ratedUsers.map((user) => user.user_id);
    const placeholders = userIds.map(() => '?').join(', ');
    const listingSql = `
      SELECT item_id, item_name, created_by
      FROM items
      WHERE created_by IN (${placeholders})
      ORDER BY created_by, item_name ASC
    `;

    connection.query(listingSql, userIds, (listingError, listings) => {
      if (listingError) {
        console.error('Error loading user listings:', listingError);
        return res.status(500).send('Database error');
      }

      const userListings = {};

      listings.forEach((listing) => {
        if (!userListings[listing.created_by]) {
          userListings[listing.created_by] = [];
        }

        userListings[listing.created_by].push(listing);
      });

      res.render('ratings', {
        users: ratedUsers,
        search: search,
        userListings: userListings
      });
    });
  });
  });
});

app.post('/ratings', checkAuthenticated, (req, res) => {
  const targetUserId = parseInt(req.body.userId, 10);
  const itemId = parseInt(req.body.itemId, 10);
  const rating = parseInt(req.body.rating, 10);
  const comment = (req.body.comment || '').trim();
  const search = (req.body.search || '').trim();

  if (!targetUserId || targetUserId === req.session.user.id) {
    req.flash('error', 'You cannot review yourself.');
    return res.redirect('/ratings');
  }

  if (!itemId || !rating || rating < 1 || rating > 5) {
    req.flash('error', 'Please choose a valid rating and item.');
    return res.redirect(`/ratings?search=${encodeURIComponent(search)}`);
  }

  if (!comment) {
    req.flash('error', 'Please add a comment with your review.');
    return res.redirect(`/ratings?search=${encodeURIComponent(search)}`);
  }

  const verifySql = 'SELECT item_id FROM items WHERE item_id = ? AND created_by = ?';

  connection.query(verifySql, [itemId, targetUserId], (verifyError, verifyResults) => {
    if (verifyError) {
      console.error('Error validating review item:', verifyError);
      req.flash('error', 'Unable to submit your review right now.');
      return res.redirect(`/ratings?search=${encodeURIComponent(search)}`);
    }

    if (verifyResults.length === 0) {
      req.flash('error', 'Please choose a valid listing for that user.');
      return res.redirect(`/ratings?search=${encodeURIComponent(search)}`);
    }

    const insertSql = `
      INSERT INTO reviews (user_id, item_id, rating, comment, review_by)
      VALUES (?, ?, ?, ?, ?)
    `;

    connection.query(insertSql, [targetUserId, itemId, rating, comment, req.session.user.id], (insertError) => {
      if (insertError) {
        console.error('Error saving review:', insertError);
        req.flash('error', 'Unable to save your review.');
        return res.redirect(`/ratings?search=${encodeURIComponent(search)}`);
      }

      updateUserAverageRating(targetUserId, (updateError) => {
        if (updateError) {
          console.error('Error updating user rating:', updateError);
        }

        req.flash('success', 'Review posted successfully.');
        return res.redirect(`/ratings?search=${encodeURIComponent(search)}`);
      });
    });
  });
});

app.post('/adminboard/update-role/:id', checkAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const role = req.body.role === 'admin' ? 'admin' : 'user';

  if (!userId) {
    req.flash('error', 'Invalid user selection.');
    return res.redirect('/adminboard');
  }

  if (userId === req.session.user.id && role === 'user') {
    req.flash('error', 'You cannot remove your own admin role.');
    return res.redirect('/adminboard');
  }

  const sql = 'UPDATE users SET role = ? WHERE user_id = ?';

  connection.query(sql, [role, userId], (error) => {
    if (error) {
      console.error('Error updating user role:', error);
      req.flash('error', 'Unable to update user role.');
      return res.redirect('/adminboard');
    }

    req.flash('success', 'User role updated successfully.');
    return res.redirect('/adminboard');
  });
});

app.post('/adminboard/delete-user/:id', checkAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);

  if (!userId) {
    req.flash('error', 'Invalid user selection.');
    return res.redirect('/adminboard');
  }

  if (userId === req.session.user.id) {
    req.flash('error', 'You cannot delete your own account.');
    return res.redirect('/adminboard');
  }

  const deleteListingsSql = 'DELETE FROM items WHERE created_by = ?';
  const deleteUserSql = 'DELETE FROM users WHERE user_id = ?';

  connection.query(deleteListingsSql, [userId], (error) => {
    if (error) {
      console.error('Error deleting user listings:', error);
      req.flash('error', 'Unable to delete user account.');
      return res.redirect('/adminboard');
    }

    connection.query(deleteUserSql, [userId], (deleteError) => {
      if (deleteError) {
        console.error('Error deleting user:', deleteError);
        req.flash('error', 'Unable to delete user account.');
        return res.redirect('/adminboard');
      }

      req.flash('success', 'User account deleted successfully.');
      return res.redirect('/adminboard');
    });
  });
});

// Eant: display users and filter them by role
app.get('/adminboard', checkAdmin, (req, res) => {
  const role = req.query.role || '';

  const allowedRoles = ['user', 'admin'];

  let sql = `
    SELECT
      user_id,
      full_name,
      email,
      role,
      rating
    FROM users
  `;

  const values = [];

  if (allowedRoles.includes(role)) {
    sql += ` WHERE role = ?`;
    values.push(role);
  }

  sql += ` ORDER BY full_name ASC`;

  connection.query(sql, values, (error, results) => {
    if (error) {
      console.error('Error retrieving users:', error);
      return res.status(500).send('Database error');
    }

    const reviewSql = `
      SELECT user_id, AVG(rating) AS averageRating
      FROM reviews
      GROUP BY user_id
    `;

    connection.query(reviewSql, (reviewError, reviewResults) => {
      if (reviewError) {
        console.error('Error loading review averages:', reviewError);
        return res.status(500).send('Database error');
      }

      const reviewMap = {};
      reviewResults.forEach((review) => {
        reviewMap[review.user_id] = Number(review.averageRating).toFixed(1);
      });

      const users = results.map((user) => ({
        ...user,
        rating: reviewMap[user.user_id] || user.rating || '0.0'
      }));

      res.render('adminboard', {
        users: users,
        role: role
      });
    });
  });
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
     created_at,
    users.full_name AS sellerName
  FROM items
  JOIN users ON items.created_by = users.user_id
  WHERE items.status != 'unlisted'
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

//mag
// View one listing
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

// Display registration form
app.get('/register', (req, res) => {
  res.render('register');
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

    if (!title || !price || !category || !condition || !location) {
      req.flash('error', 'Please complete all required listing fields.');
      return res.redirect('/addListing');
    }

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

//mag
// View listings belonging to the logged-in user
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
  WHERE items.created_by = ?
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

    if (currentUser.role !== 'admin' && currentUser.user_id !== listing.user_id) {
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