const router = require('express').Router();
const { auth, requireRole } = require('../middlewares/auth');
const ctrl = require('../controllers/auditController');

router.use(auth, requireRole('admin'));   // audit trail is admin-only

router.get('/', ctrl.list);

module.exports = router;
