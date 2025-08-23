const express = require('express');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/user');
const database = require('../database/database');
const { validate } = require('../middleware/validation');

const router = express.Router();

// Registrar usuário
router.post('/register', validate('register'), async (req, res) => {
    try {
        const { email, username, password, firstName, lastName } = req.body;

        // Verificar se usuário já existe
        const existingUser = await database.get(
            'SELECT * FROM users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Email ou username já existe'
            });
        }

        // Criar usuário
        const userData = { id: uuidv4(), email, username, password, firstName, lastName };
        const user = new User(userData);
        await user.hashPassword();

        await database.run(
            'INSERT INTO users (id, email, username, password, firstName, lastName) VALUES (?, ?, ?, ?, ?, ?)',
            [user.id, user.email, user.username, user.password, user.firstName, user.lastName]
        );

        const token = user.generateToken();

        res.status(201).json({
            success: true,
            message: 'Usuário criado com sucesso',
            data: { user: user.toJSON(), token }
        });
    } catch (error) {
        logger.error({
            message: 'Erro no registro de usuário',
            route: req.originalUrl,
            method: req.method,
            body: req.body,
            userId: req.user?.id,
            error: error.message,
            stack: error.stack
        }); 
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

// Login
router.post('/login', validate('login'), async (req, res) => {
    try {
        const { identifier, password } = req.body;

        const userData = await database.get(
            'SELECT * FROM users WHERE email = ? OR username = ?',
            [identifier, identifier]
        );

        if (!userData) {
            return res.status(401).json({
                success: false,
                message: 'Credenciais inválidas'
            });
        }

        const user = new User(userData);
        const isValidPassword = await user.comparePassword(password);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Credenciais inválidas'
            });
        }

        const token = user.generateToken();

        res.json({
            success: true,
            message: 'Login realizado com sucesso',
            data: { user: user.toJSON(), token }
        });
    } catch (error) {
        logger.error({
            message: 'Erro no login de usuário',
            route: req.originalUrl,
            method: req.method,
            body: req.body,
            userId: req.user?.id,
            error: error.message,
            stack: error.stack
        }); 
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

module.exports = router;