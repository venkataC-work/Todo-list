import { Router } from 'express';
import { currentUserId } from '../../shared/http/request-context.js';
import { parse } from '../../shared/http/parse.js';
import {
  createTaskSchema,
  listQuerySchema,
  reorderSchema,
  updateTaskSchema,
} from './task.schemas.js';
import type { TaskService } from './task.service.js';

export const taskRouter = (tasks: TaskService) =>
  Router()
    .get('/', async (req, res) => {
      res.json(await tasks.list(currentUserId(res), parse(listQuerySchema, req.query)));
    })
    .post('/', async (req, res) => {
      res
        .status(201)
        .json(await tasks.create(currentUserId(res), parse(createTaskSchema, req.body)));
    })
    .put('/order', async (req, res) => {
      const { ids } = parse(reorderSchema, req.body);
      res.json(await tasks.reorder(currentUserId(res), ids));
    })
    .get('/:id', async (req, res) => {
      res.json(await tasks.get(currentUserId(res), req.params.id));
    })
    .patch('/:id', async (req, res) => {
      const patch = parse(updateTaskSchema, req.body);
      res.json(await tasks.update(currentUserId(res), req.params.id, patch));
    })
    .delete('/:id', async (req, res) => {
      await tasks.remove(currentUserId(res), req.params.id);
      res.status(204).end();
    });
