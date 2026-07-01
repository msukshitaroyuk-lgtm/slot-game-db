const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ১. ডাটাবেজ টেবিল সেটআপ
app.get('/init-db', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_settings (id SERIAL PRIMARY KEY, win_rate INT DEFAULT 30);
      CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, phone_number VARCHAR(20) UNIQUE, balance INT DEFAULT 0);
      CREATE TABLE IF NOT EXISTS transactions (id SERIAL PRIMARY KEY, tx_id VARCHAR(50) UNIQUE, amount INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS withdrawals (id SERIAL PRIMARY KEY, user_id INT, amount INT, phone_number VARCHAR(20), status VARCHAR(20) DEFAULT 'pending');
    `);
    res.json({ success: true, message: "All tables initialized!" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ২. ওয়েব-হুক: ফরওয়ার্ডিং অ্যাপ থেকে পেমেন্ট রিসিভ করা
app.post('/api/webhook/deposit', async (req, res) => {
  const { tx_id, amount } = req.body;
  try {
    await pool.query('INSERT INTO transactions (tx_id, amount) VALUES ($1, $2) ON CONFLICT (tx_id) DO NOTHING', [tx_id, amount]);
    res.status(200).send("Forwarding Received");
  } catch (err) { res.status(500).send(err.message); }
});

// ৩. অটোমেটিক ডিপোজিট ভেরিফিকেশন (১৫ মিনিট লজিক)
app.post('/api/user/verify-deposit', async (req, res) => {
  const { user_id, tx_id, amount } = req.body;
  try {
    const tx = await pool.query('SELECT * FROM transactions WHERE tx_id = $1 AND amount = $2', [tx_id, amount]);
    if (tx.rows.length === 0) return res.status(400).json({message: "Invalid Transaction"});

    const diff = (new Date() - new Date(tx.rows[0].created_at)) / 60000;
    if (diff > 15) return res.status(400).json({message: "Transaction expired (15m limit)"});

    await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, user_id]);
    await pool.query('DELETE FROM transactions WHERE tx_id = $1', [tx_id]); // ডাবল ইউস আটকানো
    res.json({success: true, message: "Balance updated!"});
  } catch (err) { res.status(500).json({error: err.message}); }
});

// ৪. সিকিউর উইথড্র রিকোয়েস্ট
app.post('/api/user/withdraw', async (req, res) => {
  const { user_id, amount, phone_number } = req.body;
  const user = await pool.query('SELECT phone_number FROM users WHERE id = $1', [user_id]);
  
  if (user.rows[0]?.phone_number !== phone_number) return res.status(403).json({message: "Number mismatch!"});
  
  await pool.query('INSERT INTO withdrawals (user_id, amount, phone_number) VALUES ($1, $2, $3)', [user_id, amount, phone_number]);
  res.json({message: "Request sent to Admin"});
});

// ৫. আপনার আগের উইন-রেট এবং গেম লজিক এখানে থাকবে...
// (আগের কোডগুলো নিচে বসিয়ে দিন)

app.listen(port, () => console.log(`Server running on port ${port}`));
