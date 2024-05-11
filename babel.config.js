module.exports = {
    presets: [
        ['@babel/preset-env', {targets: {node: 'current'}}],
        '@babel/preset-typescript',
    ],
    "plugins": [
        ["@babel/plugin-transform-typescript", {allowDeclareFields: true}],
        ["@babel/plugin-proposal-decorators", {"legacy": true}],
        "@babel/plugin-transform-class-properties"
    ]
};