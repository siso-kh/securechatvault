const router = require('express').Router();
const { auth, requireRole } = require('../middlewares/auth');
const ctrl = require('../controllers/policyController');

router.use(auth, requireRole('admin'));   // every policy route is admin-only

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.patch('/:id/enabled', ctrl.setEnabled);
router.delete('/:id', ctrl.remove);

module.exports = router;