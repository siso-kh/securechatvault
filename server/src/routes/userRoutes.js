const router = require('express').Router();
const { auth, requireRole } = require('../middlewares/auth');
const ctrl = require('../controllers/userController');

router.use(auth, requireRole('admin'));   // every user route is admin-only

router.get('/', ctrl.list);
router.patch('/:id/role', ctrl.setRole);
router.patch('/:id/ban', ctrl.setBan);
router.delete('/:id', ctrl.remove);

module.exports = router;
