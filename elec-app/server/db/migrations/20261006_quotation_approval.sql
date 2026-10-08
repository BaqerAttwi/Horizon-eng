ALTER TABLE projects MODIFY COLUMN admin_approval ENUM('pending','approved','rejected','recheck','cancelled') DEFAULT 'pending';
