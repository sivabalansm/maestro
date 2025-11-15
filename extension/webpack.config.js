// Optional: Webpack config for building extension
// For now, extension files are used directly

module.exports = {
  mode: 'development',
  entry: {
    background: './background.js',
    content: './content.js',
  },
  output: {
    path: require('path').resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
};

