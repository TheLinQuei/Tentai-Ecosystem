const bcrypt = require('bcrypt');
const password = 'password123';
const dbHash = '$2b$10$KR2ntweHFvvrFwE6X4MUt.0itoBmJ2e2eCWFKpwZSRY.28Q/TZq';

console.log('Testing bcrypt with password123');

bcrypt.hash(password, 10).then(newHash => {
  console.log('New generated hash:', newHash);
  bcrypt.compare(password, newHash).then(match => {
    console.log('New hash match:', match);
  });
});

bcrypt.compare(password, dbHash).then(match => {
  console.log('Database hash match:', match);
});
