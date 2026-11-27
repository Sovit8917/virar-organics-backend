const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const { requirePermissions: need, requireAnyPermission: needAny } = require('../middleware/authorize');
const validate = require('../middleware/validate');

const staff = require('../controllers/staff.controller');
const roles = require('../controllers/role.controller');
const perms = require('../controllers/permission.controller');
const categories = require('../controllers/category.controller');
const products = require('../controllers/product.controller');
const sv = require('../validators/staff.validator');
const rv = require('../validators/role.validator');
const pv = require('../validators/permission.validator');
const cv = require('../validators/category.validator');
const prdv = require('../validators/product.validator');

// Every admin route requires a valid token; each route then checks its own permission.
router.use(authenticate);

// ---- Staff / users ----
router.get('/staff', need('staff:read'), validate({ query: sv.list }), staff.list);
router.post('/staff', need('staff:create'), validate({ body: sv.create }), staff.create);
router.get('/staff/:id', need('staff:read'), validate({ params: sv.idParam }), staff.get);
router.patch('/staff/:id', need('staff:update'), validate({ params: sv.idParam, body: sv.update }), staff.update);
router.delete('/staff/:id', need('staff:delete'), validate({ params: sv.idParam }), staff.deactivate);
router.put('/staff/:id/role', need('staff:assign-role'), validate({ params: sv.idParam, body: sv.assignRole }), staff.assignRole);
router.delete('/staff/:id/role', need('staff:assign-role'), validate({ params: sv.idParam }), staff.revokeRole);

// ---- Roles ----
router.get('/roles', need('roles:read'), roles.list);
router.post('/roles', need('roles:create'), validate({ body: rv.create }), roles.create);
router.get('/roles/:id', need('roles:read'), validate({ params: rv.idParam }), roles.get);
router.patch('/roles/:id', need('roles:update'), validate({ params: rv.idParam, body: rv.update }), roles.update);
router.delete('/roles/:id', need('roles:delete'), validate({ params: rv.idParam }), roles.remove);
router.put('/roles/:id/permissions', need('roles:manage-permissions'), validate({ params: rv.idParam, body: rv.setPermissions }), roles.setPermissions);
router.post('/roles/:id/permissions', need('roles:manage-permissions'), validate({ params: rv.idParam, body: rv.grantPermissions }), roles.grantPermissions);
router.delete('/roles/:id/permissions/:key', need('roles:manage-permissions'), validate({ params: rv.revokeParams }), roles.revokePermission);

// ---- Permissions ----
router.get('/permissions', need('permissions:read'), validate({ query: pv.list }), perms.list);
router.post('/permissions', need('permissions:create'), validate({ body: pv.create }), perms.create);
router.get('/permissions/:id', need('permissions:read'), validate({ params: pv.idParam }), perms.get);
router.patch('/permissions/:id', need('permissions:update'), validate({ params: pv.idParam, body: pv.update }), perms.update);
router.delete('/permissions/:id', need('permissions:delete'), validate({ params: pv.idParam }), perms.remove);

// ---- Categories (Phase 2) ----
const canReadCategories = needAny(
  'categories:create',
  'categories:update',
  'categories:delete',
  'products:create',
  'products:update',
);
router.get('/categories', canReadCategories, validate({ query: cv.listAdmin }), categories.listAdmin);
router.post('/categories', need('categories:create'), validate({ body: cv.create }), categories.create);
router.get('/categories/:id', canReadCategories, validate({ params: cv.idParam }), categories.getAdmin);
router.patch('/categories/:id', need('categories:update'), validate({ params: cv.idParam, body: cv.update }), categories.update);
router.delete('/categories/:id', need('categories:delete'), validate({ params: cv.idParam }), categories.remove);

// ---- Products & Stock (Phase 2) ----
const canReadProducts = needAny('products:create', 'products:update', 'products:delete', 'inventory:read');
router.get('/products', canReadProducts, validate({ query: prdv.listAdmin }), products.listAdmin);
router.post('/products', need('products:create'), validate({ body: prdv.create }), products.create);
router.get('/products/:id', canReadProducts, validate({ params: prdv.idParam }), products.getAdmin);
router.patch('/products/:id', need('products:update'), validate({ params: prdv.idParam, body: prdv.update }), products.update);
router.delete('/products/:id', need('products:delete'), validate({ params: prdv.idParam }), products.remove);
router.patch('/products/:id/price', need('products:update'), validate({ params: prdv.idParam, body: prdv.updatePrice }), products.updatePrice);
router.patch('/products/:id/stock', need('inventory:update'), validate({ params: prdv.idParam, body: prdv.adjustStock }), products.adjustStock);

module.exports = router;
