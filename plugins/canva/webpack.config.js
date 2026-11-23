const path = require("node:path");
const { transform } = require("@formatjs/ts-transformer");
const { DefinePlugin, optimize } = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");

// The message IDs the bundle uses. `formatjs extract` (package.json) writes
// dist/messages_en.json with the same pattern, so the IDs Canva's
// translations are keyed by match the ones in app.js.
const MESSAGE_ID_PATTERN = "[sha512:contenthash:base64:6]";

/** @type {(env: Record<string, string>, argv: { mode?: string }) => import("webpack").Configuration & import("webpack-dev-server").Configuration} */
function buildConfig(_env, argv) {
  const isDev = argv.mode !== "production";

  return {
    mode: isDev ? "development" : "production",
    context: path.resolve(__dirname, "./"),
    entry: {
      app: path.join(__dirname, "src", "index.tsx"),
    },
    target: "web",
    resolve: {
      alias: {
        styles: path.resolve(__dirname, "styles"),
        src: path.resolve(__dirname, "src"),
        // Point at qrdx source directly so dev server works without a pre-build
        qrdx: path.resolve(__dirname, "../../packages/qrdx/src/index.tsx"),
      },
      extensions: [".ts", ".tsx", ".js", ".css"],
    },
    infrastructureLogging: {
      level: "none",
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: [
            {
              loader: "ts-loader",
              options: {
                transpileOnly: true,
                configFile: path.resolve(__dirname, "tsconfig.json"),
                // Gives each react-intl message its ID, as Canva's
                // localization requires (no hand-written IDs).
                getCustomTransformers() {
                  return {
                    before: [transform({ overrideIdFn: MESSAGE_ID_PATTERN })],
                  };
                },
              },
            },
          ],
        },
        {
          test: /\.css$/,
          exclude: /node_modules/,
          use: [
            "style-loader",
            {
              loader: "css-loader",
              options: {
                modules: true,
              },
            },
          ],
        },
        {
          test: /\.css$/,
          include: /node_modules/,
          use: ["style-loader", "css-loader"],
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg)$/i,
          type: "asset/inline",
        },
      ],
    },
    optimization: {
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            format: {
              ascii_only: true,
            },
          },
        }),
      ],
    },
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname, "dist"),
      clean: true,
    },
    plugins: [
      new DefinePlugin({
        "process.env.NODE_ENV": JSON.stringify(
          isDev ? "development" : "production"
        ),
      }),
      // Canva apps must ship a single JS bundle
      new optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    ],
    ...(isDev
      ? {
          devtool: "source-map",
          devServer: {
            port: 8080,
            host: "localhost",
            allowedHosts: "all",
            webSocketServer: false,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Credentials": "true",
              "Access-Control-Allow-Private-Network": "true",
            },
            historyApiFallback: {
              rewrites: [{ from: /^\/$/, to: "/app.js" }],
            },
            client: {
              logging: "verbose",
            },
          },
        }
      : {}),
  };
}

module.exports = buildConfig;
