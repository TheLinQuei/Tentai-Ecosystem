import express from 'express';

const app = express();
const PORT = 3001;

console.log('Creating app...');

app.get('/test', (req, res) => {
  console.log('GET /test called');
  res.json({ message: 'it works' });
});

console.log('Starting server...');

const server = app.listen(PORT, () => {
  console.log(`✓ Server listening on port ${PORT}`);
});

console.log('Server object created');
