UPDATE users 
SET password_hash = '$2b$10$YEwqAzPETiI46ShOVmBmg.2zeN8XLJOO1l3FrazdsaG0KrgHRb92O' 
WHERE email = 'Shykem.middleton@gmail.com';

SELECT email, password_hash, is_active 
FROM users 
WHERE email = 'Shykem.middleton@gmail.com';
