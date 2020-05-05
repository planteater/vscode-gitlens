'use strict';
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const { CleanWebpackPlugin: CleanPlugin } = require('clean-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const CspHtmlPlugin = require('csp-html-webpack-plugin');
// const ESLintPlugin = require('eslint-webpack-plugin');
const ForkTsCheckerPlugin = require('fork-ts-checker-webpack-plugin');
const HtmlPlugin = require('html-webpack-plugin');
const HtmlSkipAssetsPlugin = require('html-webpack-skip-assets-plugin').HtmlWebpackSkipAssetsPlugin;
const ImageminPlugin = require('imagemin-webpack-plugin').default;
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');

class InlineChunkHtmlPlugin {
	constructor(htmlPlugin, patterns) {
		this.htmlPlugin = htmlPlugin;
		this.patterns = patterns;
	}

	getInlinedTag(publicPath, assets, tag) {
		if (
			(tag.tagName !== 'script' || !(tag.attributes && tag.attributes.src)) &&
			(tag.tagName !== 'link' || !(tag.attributes && tag.attributes.href))
		) {
			return tag;
		}

		let chunkName = tag.tagName === 'link' ? tag.attributes.href : tag.attributes.src;
		if (publicPath) {
			chunkName = chunkName.replace(publicPath, '');
		}
		if (!this.patterns.some(pattern => chunkName.match(pattern))) {
			return tag;
		}

		const asset = assets[chunkName];
		if (asset == null) {
			return tag;
		}

		return { tagName: tag.tagName === 'link' ? 'style' : tag.tagName, innerHTML: asset.source(), closeTag: true };
	}

	apply(compiler) {
		let publicPath = compiler.options.output.publicPath || '';
		if (publicPath && !publicPath.endsWith('/')) {
			publicPath += '/';
		}

		compiler.hooks.compilation.tap('InlineChunkHtmlPlugin', compilation => {
			const getInlinedTagFn = tag => this.getInlinedTag(publicPath, compilation.assets, tag);

			this.htmlPlugin.getHooks(compilation).alterAssetTagGroups.tap('InlineChunkHtmlPlugin', assets => {
				assets.headTags = assets.headTags.map(getInlinedTagFn);
				assets.bodyTags = assets.bodyTags.map(getInlinedTagFn);
			});
		});
	}
}

module.exports = function (env, argv) {
	env = env || {};
	env.analyzeBundle = Boolean(env.analyzeBundle);
	env.analyzeDeps = Boolean(env.analyzeDeps);
	env.production = env.analyzeBundle || Boolean(env.production);
	env.optimizeImages = Boolean(env.optimizeImages) || (env.production && !env.analyzeBundle);

	if (!env.optimizeImages && !fs.existsSync(path.resolve(__dirname, 'images/settings'))) {
		env.optimizeImages = true;
	}

	return [getExtensionConfig(env), getWebviewsConfig(env)];
};

function getExtensionConfig(env) {
	/**
	 * @type any[]
	 */
	const plugins = [
		new CleanPlugin({ cleanOnceBeforeBuildPatterns: ['**/*', '!**/webviews/**'] }),
		// new ESLintPlugin({
		// 	context: path.resolve(__dirname, 'src'),
		// 	files: '**/*.ts',
		// 	lintDirtyModulesOnly: true
		// })
		new ForkTsCheckerPlugin({
			async: false,
			eslint: true,
			useTypescriptIncrementalApi: true,
		}),
	];

	if (env.analyzeDeps) {
		plugins.push(
			new CircularDependencyPlugin({
				cwd: __dirname,
				exclude: /node_modules/,
				failOnError: false,
				onDetected: function ({ module: webpackModuleRecord, paths, compilation }) {
					if (paths.some(p => p.includes('container.ts'))) return;

					compilation.warnings.push(new Error(paths.join(' -> ')));
				},
			}),
		);
	}

	if (env.analyzeBundle) {
		plugins.push(new BundleAnalyzerPlugin());
	}

	return {
		name: 'extension',
		entry: './src/extension.ts',
		mode: env.production ? 'production' : 'development',
		target: 'node',
		node: {
			__dirname: false,
		},
		devtool: 'source-map',
		output: {
			libraryTarget: 'commonjs2',
			filename: 'extension.js',
			chunkFilename: 'feature-[name].js',
		},
		optimization: {
			minimizer: [
				new TerserPlugin({
					cache: true,
					parallel: true,
					sourceMap: true,
					terserOptions: {
						ecma: 8,
						// Keep the class names otherwise @log won't provide a useful name
						// eslint-disable-next-line @typescript-eslint/camelcase
						keep_classnames: true,
						module: true,
					},
				}),
			],
			splitChunks: {
				cacheGroups: {
					vendors: false,
				},
				chunks: 'async',
			},
		},
		externals: {
			vscode: 'commonjs vscode',
		},
		module: {
			rules: [
				{
					exclude: /\.d\.ts$/,
					include: path.resolve(__dirname, 'src'),
					test: /\.tsx?$/,
					use: {
						loader: 'ts-loader',
						options: {
							experimentalWatchApi: true,
							transpileOnly: true,
						},
					},
				},
			],
		},
		resolve: {
			alias: {
				'universal-user-agent': path.resolve(__dirname, 'node_modules/universal-user-agent/dist-node/index.js'),
			},
			extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
			symlinks: false,
		},
		plugins: plugins,
		stats: {
			all: false,
			assets: true,
			builtAt: true,
			env: true,
			errors: true,
			timings: true,
			warnings: true,
		},
	};
}

function getWebviewsConfig(env) {
	const clean = ['**/*'];
	if (env.optimizeImages) {
		console.log('Optimizing images (src/webviews/apps/images/settings/*.png)...');
		clean.push(path.resolve(__dirname, 'images/settings/*'));
	}

	const cspPolicy = {
		'default-src': "'none'",
		'img-src': ['vscode-resource:', 'https:', 'data:'],
		'script-src': ['vscode-resource:', "'nonce-Z2l0bGVucy1ib290c3RyYXA='"],
		'style-src': ['vscode-resource:'],
	};

	if (!env.production) {
		cspPolicy['script-src'].push("'unsafe-eval'");
	}

	/**
	 * @type any[]
	 */
	const plugins = [
		new CleanPlugin({ cleanOnceBeforeBuildPatterns: clean }),
		// new ESLintPlugin({
		// 	context: path.resolve(__dirname, 'src/webviews/apps'),
		// 	files: '**/*.ts',
		// 	lintDirtyModulesOnly: true
		// }),
		new ForkTsCheckerPlugin({
			tsconfig: path.resolve(__dirname, 'tsconfig.webviews.json'),
			async: false,
			eslint: true,
			useTypescriptIncrementalApi: true,
		}),
		new MiniCssExtractPlugin({
			filename: '[name].css',
		}),
		new HtmlPlugin({
			excludeAssets: [/.+-styles\.js/],
			excludeChunks: ['welcome'],
			template: 'settings/index.html',
			filename: path.resolve(__dirname, 'dist/webviews/settings.html'),
			inject: true,
			cspPlugin: {
				enabled: true,
				policy: cspPolicy,
				nonceEnabled: {
					'script-src': true,
					'style-src': true,
				},
			},
			minify: env.production
				? {
						removeComments: true,
						collapseWhitespace: true,
						removeRedundantAttributes: false,
						useShortDoctype: true,
						removeEmptyAttributes: true,
						removeStyleLinkTypeAttributes: true,
						keepClosingSlash: true,
						minifyCSS: true,
				  }
				: false,
		}),
		new HtmlPlugin({
			excludeAssets: [/.+-styles\.js/],
			excludeChunks: ['settings'],
			template: 'welcome/index.html',
			filename: path.resolve(__dirname, 'dist/webviews/welcome.html'),
			inject: true,
			cspPlugin: {
				enabled: true,
				policy: cspPolicy,
				nonceEnabled: {
					'script-src': true,
					'style-src': true,
				},
			},
			minify: env.production
				? {
						removeComments: true,
						collapseWhitespace: true,
						removeRedundantAttributes: false,
						useShortDoctype: true,
						removeEmptyAttributes: true,
						removeStyleLinkTypeAttributes: true,
						keepClosingSlash: true,
						minifyCSS: true,
				  }
				: false,
		}),
		new HtmlSkipAssetsPlugin(),
		new CspHtmlPlugin(),
		new ImageminPlugin({
			disable: !env.optimizeImages,
			externalImages: {
				context: path.resolve(__dirname, 'src/webviews/apps/images'),
				sources: glob.sync('src/webviews/apps/images/settings/*.png'),
				destination: path.resolve(__dirname, 'images'),
			},
			cacheFolder: path.resolve(__dirname, 'node_modules', '.cache', 'imagemin-webpack-plugin'),
			gifsicle: null,
			jpegtran: null,
			optipng: null,
			pngquant: {
				quality: '85-100',
				speed: env.production ? 1 : 10,
			},
			svgo: null,
		}),
		new InlineChunkHtmlPlugin(HtmlPlugin, env.production ? ['\\.css$'] : []),
	];

	return {
		name: 'webviews',
		context: path.resolve(__dirname, 'src/webviews/apps'),
		entry: {
			'main-styles': ['./scss/main.scss'],
			settings: ['./settings/index.ts'],
			welcome: ['./welcome/index.ts'],
		},
		mode: env.production ? 'production' : 'development',
		devtool: env.production ? undefined : 'eval-source-map',
		output: {
			filename: '[name].js',
			path: path.resolve(__dirname, 'dist/webviews'),
			publicPath: '#{root}/dist/webviews/',
		},
		module: {
			rules: [
				{
					exclude: /\.d\.ts$/,
					include: path.resolve(__dirname, 'src'),
					test: /\.tsx?$/,
					use: {
						loader: 'ts-loader',
						options: {
							configFile: 'tsconfig.webviews.json',
							experimentalWatchApi: true,
							transpileOnly: true,
						},
					},
				},
				{
					test: /\.scss$/,
					use: [
						{
							loader: MiniCssExtractPlugin.loader,
						},
						{
							loader: 'css-loader',
							options: {
								sourceMap: true,
								url: false,
							},
						},
						{
							loader: 'sass-loader',
							options: {
								sourceMap: true,
							},
						},
					],
					exclude: /node_modules/,
				},
			],
		},
		resolve: {
			extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
			modules: [path.resolve(__dirname, 'src/webviews/apps'), 'node_modules'],
			symlinks: false,
		},
		plugins: plugins,
		stats: {
			all: false,
			assets: true,
			builtAt: true,
			env: true,
			errors: true,
			timings: true,
			warnings: true,
		},
	};
}
