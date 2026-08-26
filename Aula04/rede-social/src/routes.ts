import { Router } from 'express';
import type { UserController } from './users/UserController.js';
import type { PostController } from './posts/PostController.js';
import { asyncHandler } from './shared/http.js';

export function createRoutes(userController: UserController, postController: PostController): Router {
  const router = Router();

  // =========================================================
  // USUÁRIOS E PERFIS (UserProfile 1:1)
  // =========================================================

  router.post(
    '/users',
    asyncHandler(async (req, res) => {
      const user = await userController.create(req.body);
      res.status(201).json(user);
    }),
  );

  router.get(
    '/users',
    asyncHandler(async (req, res) => {
      const users = await userController.list(req.query);
      res.json(users);
    }),
  );

  router.get(
    '/users/:id',
    asyncHandler(async (req, res) => {
      const user = await userController.get(Number(req.params.id));
      res.json(user);
    }),
  );

  router.post(
    '/users/:id/follow',
    asyncHandler(async (req, res) => {
      await userController.follow(Number(req.params.id), req.body);
      res.status(204).send();
    }),
  );

  router.get(
    '/users/:id/feed',
    asyncHandler(async (req, res) => {
      const feed = await userController.feed(Number(req.params.id), req.query);
      res.json(feed);
    }),
  );

  // Perfil (1:1)
  router.put(
    '/users/:id/profile',
    asyncHandler(async (req, res) => {
      const profile = await userController.upsertProfile(Number(req.params.id), req.body);
      res.json(profile);
    }),
  );

  router.get(
    '/users/:id/profile',
    asyncHandler(async (req, res) => {
      const profile = await userController.getProfile(Number(req.params.id));
      res.json(profile);
    }),
  );

  router.get(
    '/profiles',
    asyncHandler(async (req, res) => {
      const profiles = await userController.listProfiles(req.query);
      res.json(profiles);
    }),
  );

  // =========================================================
  // POSTS (1:N, N:N tags, 1:N images)
  // =========================================================

  router.post(
    '/posts',
    asyncHandler(async (req, res) => {
      const post = await postController.create(req.body);
      res.status(201).json(post);
    }),
  );

  router.get(
    '/posts',
    asyncHandler(async (req, res) => {
      const posts = await postController.list(req.query);
      res.json(posts);
    }),
  );

  router.get(
    '/posts/:id',
    asyncHandler(async (req, res) => {
      const post = await postController.get(Number(req.params.id));
      res.json(post);
    }),
  );

  router.get(
    '/tags/:name/posts',
    asyncHandler(async (req, res) => {
      const posts = await postController.listByTag(req.params.name, req.query);
      res.json(posts);
    }),
  );

  // =========================================================
  // COMENTÁRIOS (1:N Post, 1:N User)
  // =========================================================

  router.post(
    '/posts/:id/comments',
    asyncHandler(async (req, res) => {
      const comment = await postController.addComment(Number(req.params.id), req.body);
      res.status(201).json(comment);
    }),
  );

  router.get(
    '/posts/:id/comments',
    asyncHandler(async (req, res) => {
      const comments = await postController.listComments(Number(req.params.id), req.query);
      res.json(comments);
    }),
  );

  router.get(
    '/comments',
    asyncHandler(async (req, res) => {
      const comments = await postController.listComments(undefined, req.query);
      res.json(comments);
    }),
  );

  // =========================================================
  // CURTIDAS / LIKES (N:N Post <-> User)
  // =========================================================

  router.post(
    '/posts/:id/likes',
    asyncHandler(async (req, res) => {
      const like = await postController.addLike(Number(req.params.id), req.body);
      res.status(201).json(like);
    }),
  );

  router.delete(
    '/posts/:id/likes/:userId',
    asyncHandler(async (req, res) => {
      await postController.removeLike(Number(req.params.id), Number(req.params.userId));
      res.status(204).send();
    }),
  );

  router.get(
    '/posts/:id/likes',
    asyncHandler(async (req, res) => {
      const likes = await postController.listLikes(Number(req.params.id), req.query);
      res.json(likes);
    }),
  );

  router.get(
    '/likes',
    asyncHandler(async (req, res) => {
      const likes = await postController.listLikes(undefined, req.query);
      res.json(likes);
    }),
  );

  // =========================================================
  // IMAGENS (1:N Post -> Image)
  // =========================================================

  router.post(
    '/posts/:id/images',
    asyncHandler(async (req, res) => {
      const image = await postController.addImage(Number(req.params.id), req.body);
      res.status(201).json(image);
    }),
  );

  router.get(
    '/posts/:id/images',
    asyncHandler(async (req, res) => {
      const images = await postController.listImages(Number(req.params.id), req.query);
      res.json(images);
    }),
  );

  router.get(
    '/images',
    asyncHandler(async (req, res) => {
      const images = await postController.listImages(undefined, req.query);
      res.json(images);
    }),
  );

  return router;
}
