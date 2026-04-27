import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import promptsRouter from "./prompts";
import tokensRouter from "./tokens";
import projectsRouter from "./projects";
import consultingRouter from "./consulting";
import adminRouter from "./admin";
import intakeRouter from "./intake";

const router: IRouter = Router();

router.use(healthRouter);
router.use(intakeRouter);
router.use(clientsRouter);
router.use(promptsRouter);
router.use(tokensRouter);
router.use(projectsRouter);
router.use(consultingRouter);
router.use(adminRouter);

export default router;
