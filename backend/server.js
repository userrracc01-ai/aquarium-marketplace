const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcrypt');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const uploadHelper = multer({ storage: fileStorage });

// Upgraded relational database credential matrix mapping rule for public cloud connection pipelines
const db = mysql.createConnection({ 
  host: process.env.DB_HOST || '://aivencloud.com', 
  port: process.env.DB_PORT || 26061,
  user: process.env.DB_USER || 'avnadmin', 
  password: process.env.DB_PASSWORD || 'AVNS_0e7hORq299KWlzLqkQ3', // <-- Keep your secret password string inside these single quotes!
  database: process.env.DB_NAME || 'defaultdb',
  ssl: {
    rejectUnauthorized: false
  }
});



db.connect((err) => {
  if (err) throw err;
  console.log('Connected to Live Cloud Database!');

  // 1. Build Users Schema Table Structure
  db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL
    )
  `, (e) => { if (e) throw e; });

  // 2. Build Fishes Catalog Schema Table Structure
  db.query(`
    CREATE TABLE IF NOT EXISTS fishes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      breed VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      description TEXT NOT NULL,
      image_url VARCHAR(255),
      seller_username VARCHAR(255) DEFAULT 'Official Merchant'
    )
  `, (e) => { if (e) throw e; });

  // 3. Build Client Orders Tracking Schema Table Structure
  db.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      buyer_username VARCHAR(255) NOT NULL,
      fish_breed TEXT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      seller_username VARCHAR(255) DEFAULT 'Official Merchant',
      order_status VARCHAR(50) DEFAULT 'To Pay'
    )
  `, (e) => { if (e) throw e; console.log('All cloud tables successfully verified and built!'); });
});


// Helpers
function formatNumber(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString('en-US');
}

function formatCurrency(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildCatalogHtml(fishResults, loggedInUser = null) {
  if (!Array.isArray(fishResults) || fishResults.length === 0) {
    return 'No aquarium fish listed yet. Be the first seller!';
  }
  let cardsHtml = '';
  fishResults.forEach(fish => {
    const pictureSrc = fish.image_url ? `/uploads/${fish.image_url}` : '/uploads/placeholder.png';
    const breedEsc = escapeHtml(fish.breed || '');
    const descEsc = escapeHtml(fish.description || '');
    const priceNum = Number(fish.price) || 0;
    const priceStr = formatNumber(priceNum);
    const fishSeller = fish.seller_username || 'Official Merchant';
    
    // Created a clean variable to pass the logged-in buyer session into our product page redirects
    const activeBuyer = loggedInUser && loggedInUser.username ? encodeURIComponent(loggedInUser.username) : 'Guest';

    if (loggedInUser) {
      if (loggedInUser.role === 'seller') {
        // Redirection target links to our dynamic live view page path structure
        cardsHtml += `<div class="product-card" onclick="window.location.href='/fish/${fish.id}?buyer=${activeBuyer}'">` +
          `<div class="img-wrap"><img src="${pictureSrc}" class="product-img" alt="Fish image"></div>` +
          `<div class="product-info"><p class="product-breed">${breedEsc}</p><div class="product-price">₱${priceStr}</div><p class="product-desc">${descEsc}</p><div class="card-actions"><button class="btn-outline" disabled>My Shop Live View</button></div></div></div>`;
      } else {
        cardsHtml += `<div class="product-card" onclick="window.location.href='/fish/${fish.id}?buyer=${activeBuyer}'">` +
          `<div class="img-wrap"><img src="${pictureSrc}" class="product-img" alt="Fish image"></div>` +
          `<div class="product-info"><p class="product-breed">${breedEsc}</p><div class="product-price">₱${priceStr}</div><p class="product-desc">${descEsc}</p><div class="card-actions"><button class="btn-primary" onclick="event.stopPropagation(); addToCart('${breedEsc}', ${priceNum}, '${pictureSrc}', '${fishSeller}')">Add to Cart</button></div></div></div>`;
      }
    } else {
      cardsHtml += `<div class="product-card" onclick="window.location.href='/fish/${fish.id}?buyer=Guest'">` +
        `<div class="img-wrap"><img src="${pictureSrc}" class="product-img" alt="Fish image"></div>` +
        `<div class="product-info"><p class="product-breed">${breedEsc}</p><div class="product-price">₱${priceStr}</div><p class="product-desc">${descEsc}</p><div class="card-actions"><a href="/auth" class="btn-outline" onclick="event.stopPropagation();">Login to Order</a></div></div></div>`;
    }
  });
  return cardsHtml;
}


// Routes

app.get('/', (req, res) => {
  const activeMerchant = req.query.sellerUser || null;
  db.query('SELECT * FROM fishes', (fishErr, fishResults) => {
    if (fishErr) throw fishErr;
    const htmlTemplate = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
    let navbarHtml = '';
    
    if (activeMerchant) {
      navbarHtml = `<a href="/tracker?user=${activeMerchant}" class="cart-nav-btn">Tracker</a> <span class="user-profile">Merchant: <span>@${activeMerchant}</span></span> <a href="/" class="logout-btn">Logout</a>`;
      const mockUser = { role: 'seller' };
      let finalPage = htmlTemplate.replace('<!-- PROFILE_BAR_PLACEHOLDER -->', navbarHtml);
      finalPage = finalPage.replace('<!-- DATA_PLACEHOLDER -->', buildCatalogHtml(fishResults, mockUser));
      return res.send(finalPage);
    }
    
    navbarHtml = `<a href="/auth" class="nav-btn">Login / Create Account</a>`;
    let finalPage = htmlTemplate.replace('<!-- PROFILE_BAR_PLACEHOLDER -->', navbarHtml);
    finalPage = finalPage.replace('<!-- DATA_PLACEHOLDER -->', buildCatalogHtml(fishResults, null));
    return res.send(finalPage);
  });
});

// Route handler to process returning users from the cart page
app.post('/', (req, res) => {
  const activeUser = req.body.activeUser || null;
  db.query('SELECT * FROM fishes', (fishErr, fishResults) => {
    if (fishErr) throw fishErr;
    const htmlTemplate = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
    let navbarHtml = '';
    
    if (activeUser && activeUser.toLowerCase() !== 'guest') {
    // Injected an elegant My Orders link button right next to the shopping cart item tray toggle
      navbarHtml = `<button class="cart-nav-btn" onclick="window.location.href='/my-orders?buyer=${encodeURIComponent(activeUser)}'">My Orders</button> ` +
                   `<button class="cart-nav-btn" onclick="openCartView()">Cart</button> ` +
                   `<span class="user-profile">Logged in: <span id="username-span">@${escapeHtml(activeUser)}</span></span> ` +
                   `<a href="/" class="logout-btn">Logout</a>`;

      const mockUser = { username: activeUser, role: 'buyer' };
      let finalPage = htmlTemplate.replace('<!-- PROFILE_BAR_PLACEHOLDER -->', navbarHtml);
      finalPage = finalPage.replace('<!-- DATA_PLACEHOLDER -->', buildCatalogHtml(fishResults, mockUser));
      return res.send(finalPage);
    }
    
    navbarHtml = `<a href="/auth" class="nav-btn">Login / Create Account</a>`;
    let finalPage = htmlTemplate.replace('<!-- PROFILE_BAR_PLACEHOLDER -->', navbarHtml);
    finalPage = finalPage.replace('<!-- DATA_PLACEHOLDER -->', buildCatalogHtml(fishResults, null));
    return res.send(finalPage);
  });
});

app.get('/auth', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/register', async (req, res) => {
  const { username, password, role } = req.body;
  const checkQuery = 'SELECT username FROM users WHERE username = ?';
  db.query(checkQuery, [username], async (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Registration Failed</title>
          <style>
            body { background: #f8fafc; color: #0f172a; margin: 0; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
            .card { background: white; padding: 32px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); text-align: center; max-width: 400px; width: 90%; border: 1px solid #e2e8f0; }
            h2 { color: #ef4444; margin: 0 0 12px; font-size: 24px; font-weight: 700; }
            p { color: #64748b; font-size: 15px; margin: 0 0 24px; line-height: 1.5; }
            .btn { display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; transition: background 0.2s; }
            .btn:hover { background: #0284c7; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Registration Failed</h2>
            <p>The username <strong>${escapeHtml(username)}</strong> is already taken. Please try another one.</p>
            <a href="/auth" class="btn">Back to Registration</a>
          </div>
        </body>
        </html>
      `);
    }
    try {
      const encryptedPassword = await bcrypt.hash(password, 10);
      const insertQuery = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)';
      db.query(insertQuery, [username, encryptedPassword, role], (err) => {
        if (err) throw err;
        // Injected modern, minimalistic visual layouts here
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Account Created</title>
            <style>
              body { background: #f8fafc; color: #0f172a; margin: 0; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
              .card { background: white; padding: 40px 32px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); text-align: center; max-width: 400px; width: 90%; border: 1px solid #e2e8f0; }
              .success-icon { width: 48px; height: 48px; background: #bbf7d0; color: #15803d; font-size: 24px; font-weight: bold; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
              h2 { color: #0f172a; margin: 0 0 8px; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
              p { color: #64748b; font-size: 15px; margin: 0 0 28px; font-weight: 500; }
              .role-badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 24px; }
              .btn { display: block; background: #0ea5e9; color: white; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; transition: background 0.2s; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.15); }
              .btn:hover { background: #0284c7; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="success-icon">✓</div>
              <h2>Account Created</h2>
              <p>Your profile is officially registered!</p>
              <div class="role-badge">Role: ${escapeHtml(role)}</div>
              <a href="/auth" class="btn">Go to Login</a>
            </div>
          </body>
          </html>
        `);
      });
    } catch (e) {
      res.send('Error creating account. Try Again');
    }
  });
});


app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = 'SELECT * FROM users WHERE username = ?';
  db.query(query, [username], async (err, results) => {
    if (err) throw err;
    if (!results || results.length === 0) return res.send('Username not found. Try Again');
    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.send('Invalid password. Try Again');
    if (user.role === 'seller') return res.redirect('/tracker?user=' + user.username);
    
    db.query('SELECT * FROM fishes', (fishErr, fishResults) => {
      if (fishErr) throw fishErr;
      const htmlTemplate = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
            // Updates the navbar view template loaded instantly upon a successful credentials submission match
      const userNavbar = `<button class="cart-nav-btn" onclick="window.location.href='/my-orders?buyer=${encodeURIComponent(user.username)}'">My Orders</button> ` +
                         `<button class="cart-nav-btn" onclick="openCartView()">Cart</button> ` +
                         `<span class="user-profile">Logged in: <span id="username-span">@${escapeHtml(user.username)}</span></span> ` +
                         `<a href="/" class="logout-btn">Logout</a>`;

      let finalPage = htmlTemplate.replace('<!-- PROFILE_BAR_PLACEHOLDER -->', userNavbar);
      finalPage = finalPage.replace('<!-- DATA_PLACEHOLDER -->', buildCatalogHtml(fishResults, user));
      res.send(finalPage);
    });
  });
});

app.get('/tracker', (req, res) => {
  const activeUser = req.query.user || 'Merchant';
  
  db.query('SELECT * FROM fishes WHERE seller_username = ?', [activeUser], (fishErr, fishResults) => {
    if (fishErr) throw fishErr;
    
    // FIXED: Filter incoming customer log rows to ONLY read items sold by this merchant
    db.query('SELECT * FROM orders WHERE seller_username = ?', [activeUser], (orderErr, orderResults) => {
      if (orderErr) throw orderErr;
      const htmlTemplate = fs.readFileSync(path.join(__dirname, 'tracker.html'), 'utf8');
      let totalProfitCalculated = 0;
      let ordersHtml = '';
      
      if (Array.isArray(orderResults) && orderResults.length > 0) {
        orderResults.forEach(order => {
          totalProfitCalculated += parseFloat(order.price) || 0;
          ordersHtml += `<div class="item-row"> <span>Client <span class="order-buyer">@${escapeHtml(order.buyer_username)}</span> purchased: <strong>${escapeHtml(order.fish_breed)}</strong></span> <span class="price-tag">₱${formatCurrency(order.price)}</span> </div>`;
        });
      } else {
        ordersHtml = 'No client transaction logs listed yet.';
      }
      
      let listingsHtml = '';
      if (Array.isArray(fishResults) && fishResults.length > 0) {
        fishResults.forEach(fish => {
          const pic = fish.image_url ? `/uploads/${fish.image_url}` : '/uploads/placeholder.png';
          listingsHtml += `<div class="item-row" data-id="${fish.id}" data-image="${pic}" data-breed="${escapeHtml(fish.breed)}" data-price="${fish.price}" data-desc="${escapeHtml(fish.description)}"> <span class="open-listing" onclick="openListingModal(this)"><strong>${escapeHtml(fish.breed)}</strong> (<span class="listing-price">₱${formatNumber(fish.price)}</span>)</span> <button class="edit-btn" onclick="openEditModal(this.closest('.item-row')); event.stopPropagation();">Edit</button> <button class="delete-btn" onclick="deleteListing(${fish.id}); event.stopPropagation();">Delete</button> </div>`;
        });
      } else {
        listingsHtml = 'No active stock listed.';
      }
      
      let statusAlertHtml = '';
      if (!Array.isArray(fishResults) || fishResults.length === 0) {
        statusAlertHtml = `<div class="alert-bar alert-empty">⚠️ <strong>Inventory Alert:</strong> Your store stock is completely empty! Add a live aquarium product specimen below to go active.</div>`;
      } else if (Array.isArray(orderResults) && orderResults.length > 0) {
        statusAlertHtml = `<div class="alert-bar"><strong>Shop Performance:</strong> High traffic detected! You have successfully fulfilled customer inquiries. Keep adding stock varieties.</div>`;
      } else {
        statusAlertHtml = `<div class="alert-bar alert-info">ℹ️ <strong>Inventory Status:</strong> Store operational. Fish specimens are live on the public showroom boards awaiting collection.</div>`;
      }
      
      const trackerNavbar = `<span class="user-profile">Merchant ID: <span id="username-span">@${escapeHtml(activeUser)}</span></span> <a href="/?sellerUser=${activeUser}" class="back-btn">← Public View</a>`;
      let finalPage = htmlTemplate.replace('<!-- PROFILE_BAR_PLACEHOLDER -->', trackerNavbar);
      finalPage = finalPage.replace('<!-- STATUS_ALERT_PLACEHOLDER -->', statusAlertHtml);
      finalPage = finalPage.replace('<!-- TOTAL_PROFIT_PLACEHOLDER -->', '₱' + formatCurrency(totalProfitCalculated));
      finalPage = finalPage.replace('<!-- TOTAL_ITEMS_PLACEHOLDER -->', (Array.isArray(fishResults) ? fishResults.length : 0) + ' fish units');
      finalPage = finalPage.replace('<!-- LISTINGS_PLACEHOLDER -->', listingsHtml);
      finalPage = finalPage.replace('<!-- ORDERS_PLACEHOLDER -->', ordersHtml);
      res.send(finalPage);
    });
  });
});

app.post('/view-cart', (req, res) => {
  const activeUser = req.body.activeUser || 'guest';
  const htmlTemplate = fs.readFileSync(path.join(__dirname, 'cart.html'), 'utf8');
  const cartNavbar = `<span class="user-profile">Shopping as: <span id="username-span">@${escapeHtml(activeUser)}</span></span> <a href="#" onclick="goBackToMarket()" class="back-btn">← Continue Browsing</a>`;
  let finalPage = htmlTemplate.replace('<!-- PROFILE_BAR_PLACEHOLDER -->', cartNavbar);
  res.send(finalPage);
});

// Route handler to display the buyer's multi-stage order tracking panel
app.get('/my-orders', (req, res) => {
  const activeUser = req.query.buyer || 'Guest';

  if (activeUser === 'Guest') {
    return res.send('<!DOCTYPE html><html><body><h2>Access Denied</h2><p>Please log in to view your tracking history.</p><a href="/auth">Go to Login</a></body></html>');
  }

  // Fetch all orders placed by this specific logged-in buyer
  db.query('SELECT * FROM orders WHERE buyer_username = ? ORDER BY id DESC', [activeUser], (err, orderResults) => {
    if (err) throw err;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>My Orders - FishBook</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          body { background: #f8fafc; color: #0f172a; margin: 0; font-family: system-ui, -apple-system, sans-serif; }
          .orders-container { max-width: 900px; margin: 40px auto; padding: 0 20px; }
          
          /* Navigation Header Row */
          .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
          .header-title { font-size: 26px; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.5px; }
          .btn-market-back { background: none; border: none; color: #64748b; font-weight: 600; cursor: pointer; font-size: 14px; text-decoration: none; display: flex; align-items: center; gap: 6px; }
          
          /* Modern Minimalist Horizontal Status Filter Tabs */
          .status-tabs { display: flex; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 4px; margin-bottom: 24px; overflow-x: auto; gap: 4px; }
          .tab-btn { flex: 1; min-width: 100px; text-align: center; padding: 10px 12px; border: none; background: none; font-size: 14px; font-weight: 600; color: #64748b; border-radius: 8px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
          .tab-btn:hover { color: #0f172a; background: #f8fafc; }
          .tab-btn.active { background: #0ea5e9; color: white; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.15); }
          
          /* Order Item Row Cards layout */
          .order-feed-list { display: flex; flex-direction: column; gap: 16px; }
          .order-card { background: white; border: 1px solid #e2e8f0; padding: 24px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.01); display: flex; flex-direction: column; gap: 14px; }
          .card-top { display: flex; justify-content: space-between; align-items: center; font-size: 13px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
          .card-seller { font-weight: 700; color: #475569; }
          .status-badge { font-weight: 700; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
          .status-topay { color: #f59e0b; }
          .status-toship { color: #3b82f6; }
          .status-toreceive { color: #8b5cf6; }
          .status-completed { color: #10b981; }
          .status-cancelled { color: #ef4444; }
          
          .card-mid { display: flex; flex-direction: column; gap: 4px; }
          .fish-item-title { font-size: 16px; font-weight: 700; color: #0f172a; }
          .card-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
          .total-price-lbl { font-size: 14px; color: #64748b; font-weight: 500; }
          .total-price-val { font-size: 18px; font-weight: 800; color: #0ea5e9; }
          
          .empty-state { text-align: center; padding: 60px 20px; color: #94a3b8; font-size: 15px; font-weight: 500; background: white; border-radius: 16px; border: 1px solid #e2e8f0; }
          .hidden { display: none; }
        </style>
      </head>

	        <body>
        <!-- Hidden Navigation Redirect Form -->
        <form id="hidden-home-form" action="/" method="POST" class="hidden">
          <input type="hidden" name="activeUser" value="${escapeHtml(activeUser)}">
        </form>

        <div class="orders-container">
          <!-- Page Title & Quick Back Control Header Row -->
          <div class="header-row">
            <h1 class="header-title">My Purchase History</h1>
            <button type="button" class="btn-market-back" onclick="goBackToMarket()">← Back to Marketplace</button>
          </div>

          <!-- Shopee-Style Horizontal Tracking Segment Filters Toolbar -->
          <div class="status-tabs">
            <button class="tab-btn active" onclick="filterOrderTab(this, 'To Pay')">To Pay</button>
            <button class="tab-btn" onclick="filterOrderTab(this, 'To Ship')">To Ship</button>
            <button class="tab-btn" onclick="filterOrderTab(this, 'To Receive')">To Receive</button>
            <button class="tab-btn" onclick="filterOrderTab(this, 'Completed')">Completed</button>
            <button class="tab-btn" onclick="filterOrderTab(this, 'Cancelled')">Cancelled</button>
          </div>

          <!-- Dynamic Master Customer Order Stream Feed Pipeline -->
          <div class="order-feed-list" id="master-orders-wrapper">
            ${Array.isArray(orderResults) && orderResults.length > 0 
              ? orderResults.map(order => {
                  const statusClean = (order.order_status || 'To Pay').trim();
                  const badgeClass = statusClean.toLowerCase().replace(' ', '');
                  const currentTotal = Number(order.price) || 0;
                  const sellerName = order.seller_username || 'Official Merchant';
                  
                  return `
                    <div class="order-card" data-status="${statusClean}">
                      <div class="card-top">
                        <span class="card-seller">🏪 Merchant Seller: @${escapeHtml(sellerName)}</span>
                        <span class="status-badge status-${badgeClass}">${statusClean}</span>
                      </div>
                      <div class="card-mid">
                        <div class="fish-item-title">${escapeHtml(order.fish_breed)}</div>
                      </div>
                      <div class="card-bottom">
                        <span class="total-price-lbl">Order Total Amount</span>
                        <span class="total-price-val">₱${currentTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  `;
                }).join('')
              : ''
            }
            
            <!-- Default Placeholder Empty State Slate -->
            <div id="empty-history-slate" class="empty-state hidden">
              No product purchase listings logged under this category tab level.
            </div>
          </div>
        </div>

        <script>
          function goBackToMarket() {
            document.getElementById('hidden-home-form').submit();
          }

          function filterOrderTab(btnElement, targetStatusLabel) {
            // 1. Shift toggle highlighted active button toolbar states
            const buttons = document.querySelectorAll('.tab-btn');
            buttons.forEach(btn => btn.classList.remove('active'));
            btnElement.classList.add('active');

            // 2. Filter data card items matching selected workflow status
            const cards = document.querySelectorAll('.order-card');
            let visibleCount = 0;

            cards.forEach(card => {
              if (card.dataset.status.trim().toLowerCase() === targetStatusLabel.trim().toLowerCase()) {
                card.style.display = 'flex';
                visibleCount++;
              } else {
                card.style.display = 'none';
              }
            });

            // 3. Toggle empty information display placeholder if no orders match
            const emptySlate = document.getElementById('empty-history-slate');
            if (visibleCount === 0) {
              emptySlate.classList.remove('hidden');
            } else {
              emptySlate.classList.add('hidden');
            }
          }

          // Initial boot parameters call execution on page instantiation load
          document.addEventListener('DOMContentLoaded', () => {
            const activeTabBtn = document.querySelector('.tab-btn.active');
            if (activeTabBtn) filterOrderTab(activeTabBtn, 'To Pay');
          });
        </script>
      </body>
      </html>
    `);
  });
});



app.post('/add-fish', uploadHelper.single('fish_image'), (req, res) => {
  const { breed, price, description, isTracker, seller_username } = req.body;
  const imageName = req.file ? req.file.filename : null;
  const activeMerchant = seller_username || 'Official Merchant';
  
  const query = 'INSERT INTO fishes (breed, price, description, image_url, seller_username) VALUES (?, ?, ?, ?, ?)';
  db.query(query, [breed, price, description, imageName, activeMerchant], (err) => {
    if (err) throw err;
    if (isTracker) {
      res.send(`<!DOCTYPE html><html><body><h2>Stock Listed!</h2><a href="/tracker?user=${encodeURIComponent(activeMerchant)}">Back to Dashboard</a></body></html>`);
    } else {
      res.send('Fish listed for sale successfully with image! Go Back to Home');
    }
  });
});

// FIXED: Record the seller_username inside database rows upon checking out
app.post('/buy-fish', (req, res) => {
  const { buyer, breed, price, quantity, address, seller_username } = req.body;
  const qty = parseInt(quantity) || 1;
  const unit = parseFloat(price) || 0;
  const total = (unit * qty) || unit;
  const targetSeller = seller_username || 'Official Merchant';
  
  const query = 'INSERT INTO orders (buyer_username, fish_breed, price, seller_username) VALUES (?, ?, ?, ?)';
  db.query(query, [buyer, breed, total, targetSeller], (err) => {
    if (err) throw err;
    
    // Injected a modern, minimalist success card design
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Order Confirmed</title>
        <style>
          body { background: #f8fafc; color: #0f172a; margin: 0; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
          .card { background: white; padding: 40px 32px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); max-width: 440px; width: 90%; border: 1px solid #e2e8f0; text-align: center; }
          .success-icon { width: 56px; height: 56px; background: #dcfce7; color: #15803d; font-size: 28px; font-weight: bold; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
          h2 { color: #0f172a; margin: 0 0 8px; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
          .msg { color: #64748b; font-size: 15px; margin: 0 0 28px; font-weight: 500; }
          .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: left; margin-bottom: 28px; display: flex; flex-direction: column; gap: 12px; }
          .detail-row { display: flex; justify-content: space-between; font-size: 14px; }
          .detail-label { color: #64748b; font-weight: 500; }
          .detail-val { color: #0f172a; font-weight: 600; }
          .detail-total { color: #0ea5e9; font-size: 18px; font-weight: 800; }
          .back-btn { display: block; width: 100%; background: #0ea5e9; color: white; padding: 14px; border: none; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; cursor: pointer; transition: background 0.2s; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.15); font-family: inherit; }
          .back-btn:hover { background: #0284c7; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="success-icon">✓</div>
          <h2>Order Confirmed!</h2>
          <p class="msg">Thank you! Your order has been placed successfully.</p>
          
          <div class="details-box">
            <div class="detail-row">
              <span class="detail-label">Buyer Account</span>
              <span class="detail-val">@${escapeHtml(buyer)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Items Ordered</span>
              <span class="detail-val">${escapeHtml(breed)}</span>
            </div>
            <div style="border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 12px;" class="detail-row">
              <span class="detail-label" style="align-self: center;">Grand Total</span>
              <span class="detail-total">₱${formatCurrency(total)}</span>
            </div>
          </div>
          
          <form action="/" method="POST">
            <input type="hidden" name="activeUser" value="${escapeHtml(buyer)}">
            <button type="submit" class="back-btn">Go back to Market</button>
          </form>
        </div>
      </body>
      </html>
    `);
  });
});



app.post('/edit-fish', uploadHelper.single('fish_image'), (req, res) => {
  const { fishId, breed, price, description, isTracker } = req.body;
  const imageName = req.file ? req.file.filename : null;
  const fields = [];
  const params = [];
  if (breed !== undefined) { fields.push('breed = ?'); params.push(breed); }
  if (price !== undefined && price !== '') { fields.push('price = ?'); params.push(price); }
  if (description !== undefined) { fields.push('description = ?'); params.push(description); }
  if (imageName) { fields.push('image_url = ?'); params.push(imageName); }
  if (fields.length === 0) {
    if (isTracker) return res.redirect('/tracker');
    return res.redirect('/');
  }
  const query = `UPDATE fishes SET ${fields.join(', ')} WHERE id = ?`;
  params.push(fishId);
  db.query(query, params, (err) => {
    if (err) throw err;
    if (isTracker) return res.redirect('/tracker');
    res.redirect('/');
  });
});

app.post('/delete-fish', (req, res) => {
  const { fishId, isTracker } = req.body;
  const query = 'DELETE FROM fishes WHERE id = ?';
  db.query(query, [fishId], (err) => {
    if (err) throw err;
    if (isTracker) {
      res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Listing Removed - FishBook</title><style>body { background-color: #f5f8fa; font-family: 'Segoe UI', Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; } .success-card { background: white; padding: 40px; max-width: 420px; width: 90%; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.06); text-align: center; } h2 { color: #ff7675; margin-top: 0; margin-bottom: 10px; font-size: 26px; } p { color: #7f8c8d; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0; } .panel-btn { display: block; background-color: #3498db; color: white; border: none; padding: 12px; font-size: 16px; font-weight: bold; border-radius: 6px; cursor: pointer; text-decoration: none; transition: background 0.3s; } .panel-btn:hover { background-color: #2980b9; }</style></head><body><div class="success-card"><h2>Listing Dropped</h2><p>The selected fish specimen entry has been completely removed from the catalog shelf layers.</p><a href="/tracker" class="panel-btn">Back to Dashboard Control</a></div></body></html>`);
    } else {
      res.send('Listing removed successfully! Go Back to Dashboard');
    }
  });
});

// Dynamic route handler to display a dedicated premium Live View page for each product
app.get('/fish/:id', (req, res) => {
  const fishId = req.params.id;
  const activeBuyer = req.query.buyer || 'Guest';

  // Fetch the specific specimen out of your MySQL database layer
  db.query('SELECT * FROM fishes WHERE id = ?', [fishId], (err, results) => {
    if (err) throw err;
    if (!results || results.length === 0) {
      return res.status(404).send('Product listing not found.');
    }
    
    const fish = results[0];
    const pictureSrc = fish.image_url ? `/uploads/${fish.image_url}` : '/uploads/placeholder.png';
    const breedEsc = escapeHtml(fish.breed || '');
    const descEsc = escapeHtml(fish.description || '');
    const priceNum = Number(fish.price) || 0;
    const priceStr = priceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fishSeller = fish.seller_username || 'Official Merchant';

    // Outputting a standalone, high-end marketplace layout system
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${breedEsc} - Live View</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          body { background: #f8fafc; color: #0f172a; margin: 0; font-family: system-ui, -apple-system, sans-serif; }
          .live-container { max-width: 1100px; margin: 40px auto; padding: 0 20px; }
          
          /* Navigation Breadcrumb Bar */
          .breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #64748b; margin-bottom: 24px; font-weight: 500; }
          .back-link-btn { background: none; border: none; color: #0ea5e9; font-weight: 600; cursor: pointer; padding: 0; font-size: 14px; text-decoration: none; }
          
          /* Main Master Display Flex Columns */
          .split-layout { display: flex; gap: 40px; background: white; padding: 32px; border-radius: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; }
          @media (max-width: 820px) { .split-layout { flex-direction: column; padding: 20px; gap: 24px; } }
          
          /* Left Side Image Core Deck */
          .image-deck { width: 45%; position: relative; border-radius: 16px; overflow: hidden; background: #0f172a; height: 420px; border: 1px solid #f1f5f9; }
          @media (max-width: 820px) { .image-deck { width: 100%; height: 280px; } }
          .main-view-img { width: 100%; height: 100%; object-fit: cover; }
          .live-pulse-badge { position: absolute; top: 16px; left: 16px; background: rgba(14, 165, 164, 0.95); color: white; padding: 6px 14px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; backdrop-filter: blur(4px); display: flex; align-items: center; gap: 6px; }
          .pulse-dot { width: 6px; height: 6px; background: #22c55e; border-radius: 50%; display: inline-block; animation: flashDot 1.5s infinite; }
          @keyframes flashDot { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

          /* Right Side Context Layout Panel */
          .content-deck { width: 55%; display: flex; flex-direction: column; }
          @media (max-width: 820px) { .content-deck { width: 100%; } }
          
          .breed-title { font-size: 32px; font-weight: 800; color: #0f172a; margin: 0 0 4px; letter-spacing: -0.75px; }
          .seller-tag { font-size: 14px; color: #64748b; font-weight: 600; margin-bottom: 16px; }
          .seller-link { color: #0ea5e9; text-decoration: none; }
          .price-banner { font-size: 28px; font-weight: 800; color: #0ea5e9; margin: 0 0 24px; }
          
          .section-lbl { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: block; }
          .desc-body { font-size: 15px; color: #334155; line-height: 1.7; background: #f8fafc; padding: 16px 20px; border-radius: 14px; border: 1px solid #f1f5f9; margin: 0 0 28px; }
          
          /* Checkout Interaction Tray */
          .action-tray { display: flex; gap: 12px; margin-bottom: 12px; }
          .btn-cart-add { background: #0ea5e9; color: white; border: none; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; flex: 1; box-shadow: 0 4px 14px rgba(14, 165, 233, 0.2); }
          .btn-cart-add:hover { background: #0284c7; transform: translateY(-1px); }
          .btn-disabled { background: #cbd5e1; color: #94a3b8; cursor: not-allowed; box-shadow: none; }
          
          /* Interactive User Comment Section Layout */
          .comments-wrapper { margin-top: 40px; background: white; padding: 32px; border-radius: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; }
          .comment-box-list { display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px; max-height: 300px; overflow-y: auto; padding-right: 6px; }
          .comment-card { background: #f8fafc; border: 1px solid #f1f5f9; padding: 16px; border-radius: 14px; }
          .comment-meta-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 13px; }
          .comment-author { font-weight: 700; color: #334155; }
          .comment-stars { color: #f59e0b; font-weight: bold; }
          .comment-date { font-size: 11px; color: #94a3b8; margin-left: 8px; }
          .comment-msg { font-size: 14px; color: #475569; line-height: 1.5; margin: 0; }
          
          /* Input Feeder Tray Form controls */
          .comment-form-tray { display: flex; flex-direction: column; gap: 12px; background: #f8fafc; padding: 18px; border-radius: 14px; border: 1px solid #f1f5f9; }
          .inline-row { display: flex; gap: 12px; align-items: center; }
          .rating-picker { padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; font-weight: 600; font-size: 13px; color: #475569; cursor: pointer; outline: none; }
          .text-input-field { flex: 1; padding: 12px 16px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; outline: none; color: #0f172a; font-family: inherit; }
          .text-input-field:focus { border-color: #0ea5e9; box-shadow: 0 0 0 3px rgba(14,165,233,0.1); }
          .btn-submit-review { background: #0f172a; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; transition: background 0.2s; }
          .btn-submit-review:hover { background: #1e293b; }
          .guest-warning { font-size: 13px; color: #64748b; font-weight: 500; text-align: center; padding: 6px; }
          .hidden { display: none; }
        </style>
      	</head>

	    <body>
        <!-- Hidden Return Navigation Mechanism Shell Form -->
        <form id="hidden-home-form" action="/" method="POST" class="hidden">
          <input type="hidden" name="activeUser" value="${escapeHtml(activeBuyer)}">
        </form>

        <div class="live-container">
          <!-- Breadcrumbs Router Path Interface Links -->
          <div class="breadcrumb">
            <button type="button" class="back-link-btn" onclick="returnToDashboard()">← Back to Marketplace</button>
            <span>/</span>
            <span>Live Showcase</span>
            <span>/</span>
            <span style="color: #0f172a;">${breedEsc}</span>
          </div>

          <!-- Split Specimen Core Frame Box Layout -->
          <div class="split-layout">
            <!-- Left Side Frame Image Deck -->
            <div class="image-deck">
              <div class="live-pulse-badge"><span class="pulse-dot"></span>Active Showroom Specimen</div>
              <img src="${pictureSrc}" class="main-view-img" alt="${breedEsc}">
            </div>

            <!-- Right Side Frame Detail Content Meta Elements -->
            <div class="content-deck">
              <h1 class="breed-title">${breedEsc}</h1>
              <div class="seller-tag">Listed by verified seller: <span class="seller-link">@${escapeHtml(fishSeller)}</span></div>
              <div class="price-banner">₱${priceStr}</div>
              
              <span class="section-lbl">Detailed Storage Specifications</span>
              <p class="desc-body">${descEsc}</p>
              
              <div class="action-tray">
                ${activeBuyer.toLowerCase() !== 'guest' && fishSeller !== activeBuyer
                  ? `<button class="btn-cart-add" onclick="triggerDirectCartAddition('${breedEsc}', ${priceNum}, '${pictureSrc}', '${escapeHtml(fishSeller)}')">Add to Shopping Bag</button>`
                  : fishSeller === activeBuyer
                    ? `<button class="btn-cart-add btn-disabled" disabled>My Shop Asset Live View Only</button>`
                    : `<button class="btn-cart-add btn-disabled" onclick="window.location.href='/auth'">Login to Purchase Specimen</button>`
                }
              </div>
            </div>
          </div>

          <!-- Live Buyer Interactive Comment Board System Feed Section Container -->
          <div class="comments-wrapper">
            <h3 style="margin: 0 0 16px; font-size: 18px; color: #0f172a;">Customer Reviews & Ratings Feed</h3>
            <div id="live-comments-deck" class="comment-box-list"></div>
            
            ${activeBuyer.toLowerCase() !== 'guest'
              ? `<div class="comment-form-tray">
                   <span class="section-lbl" style="margin-bottom: 4px;">Leave an active review for this specimen</span>
                   <div class="inline-row">
                     <select id="user-rating-value" class="rating-picker">
                       <option value="5">5 ★ Premium</option>
                       <option value="4">4 ★ Good Condition</option>
                       <option value="3">3 ★ Standard Health</option>
                       <option value="2">2 ★ Below Average</option>
                       <option value="1">1 ★ Poor Quality</option>
                     </select>
                     <input id="user-comment-input" placeholder="Type your experience regarding this fish's condition or listing quality..." class="text-input-field">
                     <button type="button" onclick="dispatchUserComment('${escapeHtml(activeBuyer)}')" class="btn-submit-review">Publish Review</button>
                   </div>
                 </div>`
              : `<p class="guest-warning">🔒 Only registered buyers who have logged in can write active commentary strings. <a href="/auth" style="color: #0ea5e9; font-weight:600;">Log into account</a></p>`
            }
          </div>
        </div>

        <script>
          // Local storage comment cache matching engine initialization scripts
          const storageKey = 'reviews_live_view_' + ${fishId};
          
          function returnToDashboard() {
            document.getElementById('hidden-home-form').submit();
          }

          function drawCommentsFeed() {
            const container = document.getElementById('live-comments-deck');
            if (!container) return;
            const databaseLogs = JSON.parse(localStorage.getItem(storageKey) || '[]');
            
            if (databaseLogs.length === 0) {
              container.innerHTML = '<div style="font-size:13px; color:#94a3b8; text-align:center; padding:24px;">No community transaction entries recorded yet. Be the first to evaluate this asset item!</div>';
              return;
            }
            
            container.innerHTML = databaseLogs.map(item => \`
              <div class="comment-card">
                <div class="comment-meta-row">
                  <div>
                    <span class="comment-author">@\${item.author}</span>
                    <span class="comment-date">\${new Date(item.timestamp).toLocaleDateString()}</span>
                  </div>
                  <span class="comment-stars">\${'★'.repeat(item.stars)}</span>
                </div>
                <p class="comment-msg">\${item.message}</p>
              </div>
            \`).join('');
          }

          function dispatchUserComment(authorName) {
            const selectEl = document.getElementById('user-rating-value');
            const inputEl = document.getElementById('user-comment-input');
            const messageString = inputEl.value.trim();
            
            if (!messageString) {
              alert('Please describe your user experience rating inside the comment block container field.');
              return;
            }
            
            const logs = JSON.parse(localStorage.getItem(storageKey) || '[]');
            logs.unshift({
              author: authorName,
              stars: parseInt(selectEl.value),
              message: messageString,
              timestamp: Date.now()
            });
            
            localStorage.setItem(storageKey, JSON.stringify(logs));
            inputEl.value = '';
            drawCommentsFeed();
          }

          function triggerDirectCartAddition(breed, price, imagePath, sellerName) {
            let activeCart = JSON.parse(localStorage.getItem('fish_cart')) || [];
            
            // Push direct addition payloads directly matching local client-side memory storage definitions
            activeCart.push({
              breed: breed,
              price: parseFloat(price),
              quantity: 1,
              address: 'Customer Selected Destination',
              image: imagePath,
              seller: sellerName
            });
            
            localStorage.setItem('fish_cart', JSON.stringify(activeCart));
            alert(breed + ' successfully added to your shopping bag! Navigate back to checkout layers.');
          }

          // Execution boot parameters onload
          drawCommentsFeed();
        </script>
      </body>
      </html>
    `);
  });
});



app.use(express.static(path.join(__dirname)));

// Dynamic port allocation matrix rule for production infrastructure hosting environments
const serverDeploymentPort = process.env.PORT || 3000;

app.listen(serverDeploymentPort, () => { 
  console.log(`Market server successfully activated on dynamic port connection layer: ${serverDeploymentPort}`); 
});
