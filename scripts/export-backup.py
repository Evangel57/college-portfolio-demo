import json
import os
import sqlite3
import sys

DB = sys.argv[1]
OUT = sys.argv[2]
UPLOADS = sys.argv[3] if len(sys.argv) > 3 else None

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row


# ===
def rows(sql):
    return [dict(r) for r in con.execute(sql)]


def ts(v):
    if isinstance(v, (int, float)):
        from datetime import datetime, timezone
        return datetime.fromtimestamp(v / 1000, timezone.utc).isoformat().replace('+00:00', 'Z')
    return v


def base(r, fields):
    a = {f: r[f] for f in fields}
    for f in ('published', 'background'):
        if f in a and a[f] is not None:
            a[f] = bool(a[f])
    a['createdAt'] = ts(r['created_at'])
    a['updatedAt'] = ts(r['updated_at'])
    a['publishedAt'] = ts(r['published_at'])
    return a


def links(table, left, right, order=None):
    res = {}
    sql = f'select {left}, {right} from {table}' + (f' order by {order}' if order else '')
    for r in con.execute(sql):
        res.setdefault(r[0], []).append(r[1])
    return res


def media(rel_type, field):
    res = {}
    for r in con.execute(
        'select related_id, file_id from files_related_morphs where related_type=? and field=? order by "order"',
        (rel_type, field),
    ):
        res.setdefault(r[0], r[1])
    return res


# ===
post_student = links('posts_student_links', 'post_id', 'student_id')
post_tags = links('posts_tags_links', 'post_id', 'tag_id', 'tag_order')
post_worktype = links('posts_worktype_links', 'post_id', 'worktype_id')
student_conv = links('students_convergence_links', 'student_id', 'convergence_id')
tech_students = links('technologies_students_links', 'technology_id', 'student_id')
tag_category = links('tags_category_links', 'tag_id', 'category_id')
conv_spec = links('convergences_specializations_links', 'convergence_id', 'specialization_id')

post_photo = media('api::post.post', 'photo')
post_file = media('api::post.post', 'file')
student_photo = media('api::student.student', 'photo')

student_tech = {}
for t, ss in tech_students.items():
    for s in ss:
        student_tech.setdefault(s, []).append(t)
student_posts = {}
for p, ss in post_student.items():
    student_posts.setdefault(ss[0], []).append(p)
tag_posts = {}
for p, ts_ in post_tags.items():
    for t in ts_:
        tag_posts.setdefault(t, []).append(p)
category_tags = {}
for t, cs in tag_category.items():
    category_tags.setdefault(cs[0], []).append(t)
conv_students = {}
for s, cs in student_conv.items():
    conv_students.setdefault(cs[0], []).append(s)
spec_conv = {}
for c, ss in conv_spec.items():
    for s in ss:
        spec_conv.setdefault(s, []).append(c)


def one(m, k):
    v = m.get(k)
    return v[0] if isinstance(v, list) else v


# ===
data = {}

data['posts'] = [
    {
        'id': r['id'],
        'attributes': base(r, ['title', 'description', 'background', 'published']),
        'relations': {
            'worktype': ['worktypes', one(post_worktype, r['id'])],
            'tags': ['tags', post_tags.get(r['id'], [])],
            'student': ['students', one(post_student, r['id'])],
            'photo': ['files', post_photo.get(r['id'])],
            'file': ['files', post_file.get(r['id'])],
        },
    }
    for r in rows('select * from posts')
]

data['students'] = [
    {
        'id': r['id'],
        'attributes': base(r, ['name', 'surname', 'patronymic', 'url_github', 'url_vk', 'url_behance', 'about_info', 'published']),
        'relations': {
            'posts': ['posts', student_posts.get(r['id'], [])],
            'photo': ['files', student_photo.get(r['id'])],
            'technologies': ['technologies', student_tech.get(r['id'], [])],
            'convergence': ['convergences', one(student_conv, r['id'])],
            'user': ['users', None],
        },
    }
    for r in rows('select * from students')
]

data['tags'] = [
    {
        'id': r['id'],
        'attributes': base(r, ['name']),
        'relations': {
            'posts': ['posts', tag_posts.get(r['id'], [])],
            'category': ['categories', one(tag_category, r['id'])],
        },
    }
    for r in rows('select * from tags')
]

data['categories'] = [
    {'id': r['id'], 'attributes': base(r, ['name']), 'relations': {'tags': ['tags', category_tags.get(r['id'], [])]}}
    for r in rows('select * from categories')
]

data['worktypes'] = [{'id': r['id'], 'attributes': base(r, ['name']), 'relations': {}} for r in rows('select * from worktypes')]

data['technologies'] = [
    {'id': r['id'], 'attributes': base(r, ['name']), 'relations': {'students': ['students', tech_students.get(r['id'], [])]}}
    for r in rows('select * from technologies')
]

data['convergences'] = [
    {
        'id': r['id'],
        'attributes': base(r, ['name', 'course', 'full_name']),
        'relations': {
            'specializations': ['specializations', conv_spec.get(r['id'], [])],
            'students': ['students', conv_students.get(r['id'], [])],
        },
    }
    for r in rows('select * from convergences')
]

data['specializations'] = [
    {'id': r['id'], 'attributes': base(r, ['name']), 'relations': {'convergences': ['convergences', spec_conv.get(r['id'], [])]}}
    for r in rows('select * from specializations')
]

def file_url(url):
    if not UPLOADS:
        return url
    webp = os.path.splitext(url)[0] + '.webp'
    if os.path.exists(os.path.join(UPLOADS, os.path.basename(webp))):
        return webp
    return url


used_files = set(post_photo.values()) | set(post_file.values()) | set(student_photo.values())
data['files'] = [
    {
        'id': r['id'],
        'attributes': {
            'name': r['name'],
            'alternativeText': r['alternative_text'],
            'caption': r['caption'],
            'width': r['width'],
            'height': r['height'],
            'formats': None,
            'hash': r['hash'],
            'ext': r['ext'],
            'mime': r['mime'],
            'size': r['size'],
            'url': file_url(r['url']),
            'previewUrl': None,
            'provider': 'local',
            'createdAt': ts(r['created_at']),
            'updatedAt': ts(r['updated_at']),
        },
        'relations': {},
    }
    for r in rows('select * from files')
    if r['id'] in used_files
]

with open(OUT, 'w') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

print({k: len(v) for k, v in data.items()})
