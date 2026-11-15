const router = require('express').Router();
const { auth } = require('../middlewares/auth');
const ctrl = require('../controllers/conversationController');

router.use(auth);                    // everything below requires a valid JWT

router.post('/', ctrl.create);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;