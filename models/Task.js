class Task {
    constructor(data) {
        this.id = data.id;
        this.title = data.title;
        this.description = data.description || '';
        this.completed = data.completed || false;
        this.priority = data.priority || 'medium';
        this.userId = data.userId;
        this.createdAt = data.createdAt;
        this.category = data.category || null;
        this.tags = data.tags ? data.tags.split(',') : [];
        this.dueDate = data.dueDate || null;
    }

    validate() {
        const errors = [];
        if (!this.title?.trim()) errors.push('Título é obrigatório');
        if (!this.userId) errors.push('Usuário é obrigatório');
        return { isValid: errors.length === 0, errors };
    }

    toJSON() {
        return { ...this, tags: this.tags  };
    }
}

module.exports = Task;