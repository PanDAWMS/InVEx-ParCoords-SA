const ExtractCssChunks = require('extract-css-chunks-webpack-plugin');
var webpack = require('webpack');

module.exports = {
    entry: './src/index.js',
    output: {
	library: 'ParallelCoordinates',
      filename: './index.js',
	libraryTarget: 'umd'
    },
    module: {
        rules: [
        {
	    test: /\.js$/,
	    use: { loader: 'babel-loader' }
	},
	{
          test: /\.css$/,
          use: { loader: 'css-loader' }
        },
	{
          test: /\.(png|jpe?g|gif)$/,
          use: { loader: 'file-loader' }
        }
        ]
    },
    plugins: [
	new ExtractCssChunks(),
        new webpack.HotModuleReplacementPlugin(),
	new webpack.ProvidePlugin({
            $: "jquery",
            jQuery: "jquery",
            "window.jQuery": "jquery"
        })
    ]
};