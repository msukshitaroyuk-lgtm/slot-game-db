const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ১. ডাটাবেজে সেটিংস টেবিল তৈরি করার রুট (প্রজেক্ট রান হলে একবার এই লিংকে ভিজিট করতে হবে)
app.get('/init-db', async (req, res) => {
  try {
    // সেটিংস টেবিল তৈরি (যেখানে win_rate থাকবে)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_settings (
        id SERIAL PRIMARY KEY,
        win_rate INT DEFAULT 30
      );
    `);
    
    // ডিফল্ট ৩০% উইন রেট ইনসার্ট করা (যদি আগে থেকে না থাকে)
    const check = await pool.query('SELECT * FROM game_settings WHERE id = 1');
    if (check.rows.length === 0) {
      await pool.query('INSERT INTO game_settings (id, win_rate) VALUES (1, 30)');
    }
    
    res.json({ success: true, message: "Database table initialized successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ২. এডমিন প্যানেলের জন্য রুট: বর্তমান উইন রেট দেখা
app.get('/api/admin/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT win_rate FROM game_settings WHERE id = 1');
    res.json({ success: true, win_rate: result.rows[0].win_rate });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ৩. এডমিন প্যানেলের জন্য রুট: উইন রেট পরিবর্তন করা (গেম কন্ট্রোল)
app.post('/api/admin/update-settings', async (req, res) => {
  const { win_rate } = req.body; // এডমিন প্যানেল থেকে নতুন পার্সেন্টেজ আসবে (০ থেকে ১০০)
  
  if (win_rate < 0 || win_rate > 100) {
    return res.status(400).json({ success: false, message: "Win rate must be between 0 and 100" });
  }

  try {
    await pool.query('UPDATE game_settings SET win_rate = $1 WHERE id = 1', [win_rate]);
    res.json({ success: true, message: `Win rate successfully updated to ${win_rate}%` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ৪. গেম খেলার রুট (স্লট স্পিন লজিক - যা এডমিনের সেট করা উইন রেট মেনে চলবে)
app.post('/api/game/spin', async (req, res) => {
  try {
    // ডাটাবেজ থেকে এডমিনের সেট করা win_rate নিয়ে আসা
    const settings = await pool.query('SELECT win_rate FROM game_settings WHERE id = 1');
    const winRate = settings.rows[0].win_rate; // ধরো এটি ৩০

    // ০ থেকে ৯৯ এর মধ্যে একটি র্যান্ডম সংখ্যা তৈরি করা
    const randomNumber = Math.floor(Math.random() * 100);
    
    let isWin = false;
    let resultSymbols = [];

    // যদি র্যান্ডম সংখ্যাটি winRate এর চেয়ে ছোট হয়, তবে ইউজার জিতবে
    if (randomNumber < winRate) {
      isWin = true;
      // জেতার জন্য একই ৩টি সিম্বল (যেমন: ['🍒', '🍒', '🍒'])
      const symbols = ['🍒', '🍋', '🍇', '💎', '🔔'];
      const winningSymbol = symbols[Math.floor(Math.random() * symbols.length)];
      resultSymbols = [winningSymbol, winningSymbol, winningSymbol];
    } else {
      // ইউজার হারবে (আলাদা আলাদা ৩টি সিম্বল, যাতে ম্যাচ না করে)
      resultSymbols = ['🍒', '🍋', '🍇']; 
      // একটু মিক্স করে দেওয়া যাতে এক না হয়
      resultSymbols.sort(() => Math.random() - 0.5);
    }

    res.json({
      success: true,
      win: isWin,
      symbols: resultSymbols,
      message: isWin ? "অভিনন্দন! আপনি জিতেছেন।" : "দুঃখিত! আবার চেষ্টা করুন।"
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
           
