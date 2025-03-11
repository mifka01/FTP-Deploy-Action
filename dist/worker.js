"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null)
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const ftp = __importStar(require("basic-ftp"));
const syncProvider_1 = require("./syncProvider");
const deploy_1 = require("./deploy");
const utilities_1 = require("./utilities");
(() =>
  __awaiter(void 0, void 0, void 0, function* () {
    const args = worker_threads_1.workerData.args;
    let client = new ftp.Client(args.timeout);
    const logger = new utilities_1.Logger(args["log-level"]);
    const reconnectInterval = args["reconnect-timeout"] * 1000;
    let lastConnectionTime = 0;
    const timings = {
      start: () => {},
      stop: () => {},
      getTime: () => 0,
      getTimeFormatted: () => "0ms",
    };
    let syncProvider;
    const establishConnection = () =>
      __awaiter(void 0, void 0, void 0, function* () {
        if (client && !client.closed) {
          client.close();
        }
        client = new ftp.Client(args.timeout);
        try {
          yield (0, deploy_1.connect)(client, args, logger);
          lastConnectionTime = Date.now();
          syncProvider = new syncProvider_1.FTPSyncProvider(
            client,
            logger,
            timings,
            args["local-dir"],
            args["server-dir"],
            args["state-name"],
            args["dry-run"],
          );
          return true;
        } catch (error) {
          return false;
        }
      });
    if (!(yield establishConnection())) {
      process.exit(1);
    }
    const ensureFreshConnection = () =>
      __awaiter(void 0, void 0, void 0, function* () {
        const currentTime = Date.now();
        if (currentTime - lastConnectionTime >= reconnectInterval) {
          return yield establishConnection();
        }
        return true;
      });
    function processTask(task) {
      return __awaiter(this, void 0, void 0, function* () {
        try {
          if (!(yield ensureFreshConnection())) {
            return false;
          }
          yield syncProvider.syncRecordToServer(task.record, task.action);
          worker_threads_1.parentPort === null ||
          worker_threads_1.parentPort === void 0
            ? void 0
            : worker_threads_1.parentPort.postMessage({
                type: "taskCompleted",
                result: task.record.name,
              });
          return true;
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("Not connected")
          ) {
            if (yield establishConnection()) {
              try {
                yield syncProvider.syncRecordToServer(task.record, task.action);
                worker_threads_1.parentPort === null ||
                worker_threads_1.parentPort === void 0
                  ? void 0
                  : worker_threads_1.parentPort.postMessage({
                      type: "taskCompleted",
                      result: task.record.name,
                    });
                return true;
              } catch (retryError) {
                worker_threads_1.parentPort === null ||
                worker_threads_1.parentPort === void 0
                  ? void 0
                  : worker_threads_1.parentPort.postMessage({
                      type: "taskFailed",
                      result: { task: task, error: retryError },
                    });
                return false;
              }
            }
          }
          worker_threads_1.parentPort === null ||
          worker_threads_1.parentPort === void 0
            ? void 0
            : worker_threads_1.parentPort.postMessage({
                type: "taskFailed",
                result: { task: task, error },
              });
          return false;
        }
      });
    }
    worker_threads_1.parentPort === null ||
    worker_threads_1.parentPort === void 0
      ? void 0
      : worker_threads_1.parentPort.on("message", (msg) =>
          __awaiter(void 0, void 0, void 0, function* () {
            if (msg.type === "newTask") {
              const task = msg.task;
              yield processTask(task);
              return;
            }
            if (msg === "exit") {
              client.close();
              console.log("Worker closed FTP connection");
              if (client.closed) {
                process.exit(0);
              }
            }
          }),
        );
  }))();
