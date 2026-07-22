# SellSpotApp - local practice version

This is a simple local version of SellSpot that follows the same structure used in the C237 lesson
apps: one `app.js`, Bootstrap EJS pages directly inside `views`, Express routes, sessions, flash
messages and Multer image upload.

The app does not connect to MySQL yet because the team database has not been provided. Accounts and
listings are stored in JavaScript arrays and reset whenever the server restarts.

## Run locally

```text
npm install
npx nodemon app.js
```

Open `http://localhost:3000`.

## Temporary assumed database fields

When the real database is received, the current forms assume these fields:

- `users`: id, name, email, password, role
- `listings`: id, title, description, price, category, condition, location, image, sellerId

The EJS pages can remain. The temporary array `.find()`, `.push()` and `.filter()` code in `app.js`
will be replaced with the callback-based `connection.query()` and parameterised SQL style used in
the C237 lessons.

