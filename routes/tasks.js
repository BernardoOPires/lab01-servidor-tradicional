const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Task = require('../models/task');
const database = require('../database/database');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

const router = express.Router();

const logger = require('../config/logger');

const userRateLimit = require('../middleware/rateLimiteUser');
// Todas as rotas requerem autenticação
router.use(authMiddleware, userRateLimit);

// Listar tarefas
const cache = new Map();

router.get('/', async (req, res) => {
    try {

        let { page, limit, completed, priority, category, tags, startDate, endDate } = req.query;
        page = page ? parseInt(page) : 1;
        limit = limit ? parseInt(limit) : 10;
        const offset = (page - 1) * limit;

        const key = `tasks:${req.user.id}:${page}:${limit}:${completed || 'all'}:${priority || 'all'}`;
        const now = Date.now();
        const ttl = 30 * 1000;

        if (cache.has(key)) {
            const { data, timestamp } = cache.get(key);
            if (now - timestamp < ttl) {
                return res.json({ success: true, cached: true, ...data });
            }
        }
        console.log("Usuário autenticado no GET:", req.user);

        let sql = 'SELECT * FROM tasks WHERE userId = ?';
        const params = [req.user.id];

        if (completed !== undefined) {
            sql += ' AND completed = ?';
            params.push(completed === 'true' ? 1 : 0);
        }

        if (priority) {
            sql += ' AND priority = ?';
            params.push(priority);
        }

        if (category) {
            sql += ' AND category LIKE ?';
            params.push(`%${category.trim()}%`);
        }
        if (tags) {
            sql += ' AND tags LIKE ?';
            params.push(`%${tags}%`);
        }

        if (startDate && endDate) {
            sql += ' AND dueDate BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        sql += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        //database.all executa a query com sql --> mas os dados vc puxa pelo res?
        const rows = await database.all(sql, params); //essa parte retornou os dados, ent basta usar a formatação na resposta?
        //percorre as linhas retornadas pelo bd eo obj task com ela
        const tasks = rows.map(row => new Task({ ...row, completed: row.completed === 1 }));
        console.log(sql)
        console.log(params)
        console.log(rows)
        const result = {
            page,
            limit,
            count: tasks.length,
            data: tasks.map(task => task.toJSON())
        };

        cache.set(key, { data: result, timestamp: now });

        console.log("SQL final:", sql);
        console.log("Params:", params);
        console.log("Rows retornadas:", rows);
        res.json({ success: true, cached: false, ...result });
    } catch (error) {
        logger.error({
            message: 'Erro ao listar tarefas',
            route: req.originalUrl,
            method: req.method,
            query: req.query,
            userId: req.user?.id,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

// Criar tarefa
router.post('/', validate('task'), async (req, res) => {
    try {
        const taskData = {
            id: uuidv4(),
            ...req.body,
            userId: req.user.id
        };

        const task = new Task(taskData);
        const validation = task.validate();

        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Dados inválidos',
                errors: validation.errors
            });
        }

        console.log("Criando task:", {
  body: req.body,
  user: req.user
});
        await database.run(
            `INSERT INTO tasks 
   (id, title, description, priority, category, tags, dueDate, userId) 
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                task.id,
                task.title,
                task.description,
                task.priority,
                task.category,
                Array.isArray(task.tags) ? task.tags.join(',') : task.tags,
                task.dueDate,
                task.userId
            ]
        );

        const check = await database.all("SELECT id, title, category, userId FROM tasks");
console.log("Tasks salvas no banco:", check);

        res.status(201).json({
            success: true,
            message: 'Tarefa criada com sucesso',
            data: task.toJSON()
        });
    } catch (error) {
        logger.error({
            message: 'Erro ao criar tarefa',
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

// Buscar tarefa por ID
router.get('/:id', async (req, res) => {
    try {
        const row = await database.get(
            'SELECT * FROM tasks WHERE id = ? AND userId = ?',
            [req.params.id, req.user.id]
        );

        if (!row) {
            return res.status(404).json({
                success: false,
                message: 'Tarefa não encontrada'
            });
        }

        const task = new Task({ ...row, completed: row.completed === 1 });
        res.json({
            success: true,
            data: task.toJSON()
        });
    } catch (error) {
        logger.error({
            message: 'Erro ao buscar tarefas por id',
            route: req.originalUrl,
            method: req.method,
            query: req.query,
            userId: req.user?.id,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

// Atualizar tarefa
router.put('/:id', async (req, res) => {
    try {
        const { title, description, completed, priority, category, tags, dueDate } = req.body;

        const result = await database.run(
            `UPDATE tasks 
             SET title = ?, description = ?, completed = ?, priority = ?, category = ?, tags = ?, dueDate = ?
             WHERE id = ? AND userId = ?`,
            [title,
                description,
                completed ? 1 : 0,
                priority,
                category,
                Array.isArray(tags) ? tags.join(',') : tags,
                dueDate,
                req.params.id,
                req.user.id
            ]
        );

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tarefa não encontrada'
            });
        }

        const updatedRow = await database.get(
            'SELECT * FROM tasks WHERE id = ? AND userId = ?',
            [req.params.id, req.user.id]
        );

        const task = new Task({ ...updatedRow, completed: updatedRow.completed === 1 });

        res.json({
            success: true,
            message: 'Tarefa atualizada com sucesso',
            data: task.toJSON()
        });
    } catch (error) {
        logger.error({
            message: 'Erro ao atualizar tarefa',
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

// Deletar tarefa
router.delete('/:id', async (req, res) => {
    try {
        const result = await database.run(
            'DELETE FROM tasks WHERE id = ? AND userId = ?',
            [req.params.id, req.user.id]
        );

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tarefa não encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Tarefa deletada com sucesso'
        });
    } catch (error) {
        logger.error({
            message: 'Erro ao deletar tarefas',
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

// Estatísticas
const statsCache = new Map();

router.get('/stats/summary', async (req, res) => {
    try {
        const key = `stats:${req.user.id}`;
        const now = Date.now();
        const ttl = 30 * 1000; // = a 30 secs

        // verificar se cache expirou
        if (statsCache.has(key)) {
            const { data, timestamp } = statsCache.get(key);
            if (now - timestamp < ttl) {
                return res.json({
                    success: true,
                    cached: true,
                    data
                });
            }
        }
        const stats = await database.get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) as pending
            FROM tasks WHERE userId = ?
        `, [req.user.id]);

        const result = {
            ...stats,
            completionRate: stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(2) : 0
        };

        statsCache.set(key, { data: result, timestamp: now });

        res.json({
            success: true,
            cached: false,
            data: result
        });
    } catch (error) {
        logger.error({
            message: 'Erro ao listar estatisticas das tarefas',
            route: req.originalUrl,
            method: req.method,
            query: req.query,
            userId: req.user?.id,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

module.exports = router;