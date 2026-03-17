"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiModule = void 0;
const aiModule = async (app) => {
    app.get('/', async (req) => ({
        module: 'ai',
        org_id: req.org_id,
        user_id: req.user_id,
        role: req.role,
    }));
};
exports.aiModule = aiModule;
