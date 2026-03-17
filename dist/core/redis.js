"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.automationQueue = exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const bullmq_1 = require("bullmq");
const config_1 = require("./config");
exports.redis = new ioredis_1.default(config_1.config.redisUrl, {
    maxRetriesPerRequest: null,
});
exports.automationQueue = new bullmq_1.Queue('automations', {
    connection: { url: config_1.config.redisUrl },
});
