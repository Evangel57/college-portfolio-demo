// next.config.js

module.exports = {
    env: {
        NEXT_PUBLIC_STRAPI_URL: '/api',
        NEXT_PUBLIC_STRAPI_URL_UPLOAD: '/api/upload',
        NEXT_PUBLIC_STRAPI_URL_LOAD_FILES: '',
    },
    images: {
        domains: [
            'college-portfolio.hb.ru-msk.vkcs.cloud',
            'i.pinimg.com',
        ],
    },
};
