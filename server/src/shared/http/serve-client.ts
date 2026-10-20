import { extname, join } from 'node:path';
import express, { type RequestHandler } from 'express';

/** Only hashed assets are cached long term. Client routes always get fresh HTML. */
export const serveClient = (directory: string): RequestHandler[] => [
  express.static(directory, {
    index: false,
    maxAge: 0,
    setHeaders: (res, path) => {
      if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      else if (path.startsWith(join(directory, 'assets') + '/'))
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }),
  (req, res, next) => {
    if (
      req.method !== 'GET' ||
      req.path === '/api' ||
      req.path.startsWith('/api/') ||
      extname(req.path)
    )
      return next();
    res.set('Cache-Control', 'no-cache').sendFile(join(directory, 'index.html'));
  },
];
