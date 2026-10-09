export const roles: Record<number, any> = {
    1: { id: 1, name: 'Authenticated', description: 'Студент', type: 'authenticated' },
    3: { id: 3, name: 'Statistic', description: 'Статистик', type: 'statistic' },
    4: { id: 4, name: 'Moderator', description: 'Модератор', type: 'moderator' },
};

const base = {
    provider: 'local',
    confirmed: true,
    blocked: false,
    createdAt: '2024-10-01T00:00:00.000Z',
    updatedAt: '2024-10-01T00:00:00.000Z',
};

export const demoUsers = [
    { ...base, id: 1, username: 'student', email: 'student@demo.ru', roleId: 1, studentId: 206 },
    { ...base, id: 2, username: 'moderator', email: 'moderator@demo.ru', roleId: 4, studentId: null },
    { ...base, id: 3, username: 'statistic', email: 'statistic@demo.ru', roleId: 3, studentId: null },
];
