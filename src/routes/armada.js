// src/routes/armada.js
const router = require('express').Router();
const ctrl = require('../controllers/armadaController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, authorize('admin'), ctrl.getArmadaAktif);
router.get('/:trip_id/detail', authenticate, authorize('admin', 'driver'), ctrl.getDetailMuatan);

module.exports = router;
