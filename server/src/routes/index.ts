import express from 'express';
import users from './user.routes.js'
import auth from './auth.routes.js'

const router = express.Router();
router.use('/users', users);
router.use('/auth', auth)

export default router;