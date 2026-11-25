const router = require('express').Router();
const { register, login, adminLogin, me } = require('../controllers/authController');
const { auth } = require('../middlewares/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/admin-login', adminLogin);
router.get('/me', auth, me); 

module.exports = router;