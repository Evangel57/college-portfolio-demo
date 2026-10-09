import qs from 'qs';
import rawData from '@/mock/data.json';
import { demoUsers, roles } from '@/mock/users';

export const dynamic = 'force-dynamic';

type Entity = {
    id: number;
    attributes: Record<string, any>;
    relations: Record<string, [string, number | number[] | null]>;
};

const data = rawData as unknown as Record<string, Entity[]>;

// ===

const json = (body: any, status = 200) => Response.json(body, { status });

const notFound = () => json({ data: null, error: { status: 404, name: 'NotFoundError', message: 'Not Found' } }, 404);

const findEntity = (collection: string, id: number) => data[collection]?.find((e) => e.id === id);

const toArray = (v: any): any[] => {
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') return Object.values(v);
    return String(v).split(',');
};

const getRelated = (entity: Entity, name: string): Entity[] => {
    const [collection, ids] = entity.relations[name];
    if (collection === 'users') return [];
    return toArray(ids)
        .map((id) => findEntity(collection, Number(id)))
        .filter(Boolean) as Entity[];
};

// ===

const sameValue = (actual: any, expected: any) => {
    if (actual === null || actual === undefined) return false;
    return String(actual) === String(expected);
};

const matchOperators = (actual: any, ops: any): boolean => {
    if (typeof ops !== 'object' || ops === null) return sameValue(actual, ops);
    return Object.entries(ops).every(([op, expected]: [string, any]) => {
        switch (op) {
            case '$eq':
                return sameValue(actual, expected);
            case '$ne':
                return !sameValue(actual, expected);
            case '$in':
                return toArray(expected).some((v) => sameValue(actual, v));
            case '$notIn':
                return !toArray(expected).some((v) => sameValue(actual, v));
            case '$contains':
                return actual != null && String(actual).includes(String(expected));
            case '$containsi':
                return actual != null && String(actual).toLowerCase().includes(String(expected).toLowerCase());
            case '$null':
                return (actual == null) === (String(expected) === 'true');
            case '$notNull':
                return (actual != null) === (String(expected) === 'true');
            default:
                return true;
        }
    });
};

const matchFilters = (entity: Entity, filters: any): boolean => {
    if (!filters || typeof filters !== 'object') return true;
    return Object.entries(filters).every(([key, value]: [string, any]) => {
        if (key === '$or') return toArray(value).some((f) => matchFilters(entity, f));
        if (key === '$and') return toArray(value).every((f) => matchFilters(entity, f));
        if (key === '$not') return !matchFilters(entity, value);
        if (key === 'id') return matchOperators(entity.id, value);
        if (key in entity.relations) {
            const related = getRelated(entity, key);
            const keys = Object.keys(value || {});
            if (keys.length && keys.every((k) => k.startsWith('$'))) {
                return related.some((r) => matchOperators(r.id, value));
            }
            return related.some((r) => matchFilters(r, value));
        }
        return matchOperators(entity.attributes[key], value);
    });
};

// ===

const populateKeys = (entity: Entity, populate: any): string[] => {
    if (!populate) return [];
    const all = Object.keys(entity.relations);
    if (populate === '*' || (Array.isArray(populate) && populate.includes('*'))) return all;
    const keys = typeof populate === 'object' && !Array.isArray(populate) ? Object.keys(populate) : toArray(populate);
    return keys.filter((k) => all.includes(k));
};

const pickFields = (attributes: Record<string, any>, fields: any) => {
    const list = toArray(fields);
    if (!list.length) return { ...attributes };
    return Object.fromEntries(list.filter((f) => f in attributes).map((f) => [f, attributes[f]]));
};

const serialize = (entity: Entity, populate: any, fields?: any) => {
    const attributes: Record<string, any> = pickFields(entity.attributes, fields);
    for (const key of populateKeys(entity, populate)) {
        const [, ids] = entity.relations[key];
        const related = getRelated(entity, key).map((r) => ({ id: r.id, attributes: { ...r.attributes } }));
        attributes[key] = { data: Array.isArray(ids) ? related : related[0] ?? null };
    }
    return { id: entity.id, attributes };
};

const paginate = (items: any[], pagination: any = {}) => {
    const total = items.length;
    if (pagination.page || pagination.pageSize) {
        const page = Number(pagination.page) || 1;
        const pageSize = Number(pagination.pageSize) || 25;
        return {
            items: items.slice((page - 1) * pageSize, page * pageSize),
            meta: { pagination: { page, pageSize, pageCount: Math.ceil(total / pageSize), total } },
        };
    }
    const start = Number(pagination.start) || 0;
    const limit = Number(pagination.limit) || 25;
    return { items: items.slice(start, start + limit), meta: { pagination: { start, limit, total } } };
};

const sortItems = (items: Entity[], sort: any) => {
    const rules = toArray(sort).map((s) => String(s).split(':'));
    if (!rules.length) return items;
    return [...items].sort((a, b) => {
        for (const [field, dir] of rules) {
            const av = field === 'id' ? a.id : a.attributes[field];
            const bv = field === 'id' ? b.id : b.attributes[field];
            if (av === bv) continue;
            const res = av > bv ? 1 : -1;
            return dir?.toLowerCase() === 'desc' ? -res : res;
        }
        return 0;
    });
};

// ===

const serializeUser = (user: any, populate: any) => {
    const { roleId, studentId, ...rest } = user;
    const result: Record<string, any> = { ...rest };
    const keys = populate === '*' ? ['role', 'student', 'convergences'] : toArray(populate);
    if (keys.includes('role')) result.role = roles[roleId];
    if (keys.includes('student')) {
        const student = studentId ? findEntity('students', studentId) : null;
        result.student = student ? { id: student.id, ...student.attributes } : null;
    }
    if (keys.includes('convergences')) {
        result.convergences = user.roleId === 4 ? data.convergences.map((c) => ({ id: c.id, ...c.attributes })) : [];
    }
    return result;
};

const handleUsers = (id: string | undefined, query: any) => {
    if (id === 'me') return json({ error: { status: 401, message: 'Demo' } }, 401);
    if (id) {
        const user = demoUsers.find((u) => u.id === Number(id));
        return user ? json(serializeUser(user, query.populate)) : notFound();
    }
    const users = demoUsers.filter((u) => matchFilters({ id: u.id, attributes: u, relations: {} }, query.filters));
    return json(users.map((u) => serializeUser(u, query.populate)));
};

const handleAuth = async (action: string, request: Request) => {
    const body = await request.json().catch(() => ({}));
    if (action === 'local') {
        const user = demoUsers.find((u) => u.email === String(body.identifier).toLowerCase());
        if (!user) {
            return json({ data: null, error: { status: 400, name: 'ValidationError', message: 'Invalid identifier or password' } }, 400);
        }
        return json({ jwt: `demo-${user.id}`, user: serializeUser(user, null) });
    }
    return json({ data: null, error: { status: 400, name: 'ApplicationError', message: 'Регистрация отключена в демо-версии' } }, 400);
};

// ===

const handleRead = (segments: string[], request: Request) => {
    const query = qs.parse(new URL(request.url).search.slice(1), { depth: 10, arrayLimit: 1000 }) as any;
    const [collection, id] = segments;

    if (collection === 'users') return handleUsers(id, query);
    if (collection === 'users-permissions' || collection === 'upload') return json([]);
    if (!data[collection]) return notFound();

    if (id) {
        const entity = findEntity(collection, Number(id));
        if (!entity) return notFound();
        return json({ data: serialize(entity, query.populate, query.fields), meta: {} });
    }

    const filtered = sortItems(data[collection].filter((e) => matchFilters(e, query.filters)), query.sort);
    const { items, meta } = paginate(filtered, query.pagination);
    return json({ data: items.map((e) => serialize(e, query.populate, query.fields)), meta });
};

const handleWrite = async (segments: string[], request: Request) => {
    const [collection, id] = segments;
    if (collection === 'auth') return handleAuth(id, request);
    if (collection === 'upload') return json([{ id: 0, name: 'demo', url: '' }]);

    const body = await request.json().catch(() => ({}));
    const existing = id ? findEntity(collection, Number(id)) : undefined;
    return json({ data: { id: existing?.id ?? 0, attributes: { ...existing?.attributes, ...body?.data } }, meta: {} });
};

type Context = { params: { path: string[] } };

export const GET = (request: Request, { params }: Context) => handleRead(params.path, request);
export const POST = (request: Request, { params }: Context) => handleWrite(params.path, request);
export const PUT = (request: Request, { params }: Context) => handleWrite(params.path, request);
export const DELETE = (request: Request, { params }: Context) => handleWrite(params.path, request);
