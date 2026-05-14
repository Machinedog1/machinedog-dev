import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import clientsRouter from "./clients";
import promptsRouter from "./prompts";
import tokensRouter from "./tokens";
import projectsRouter from "./projects";
import changeRequestsRouter from "./change-requests";
import consultingRouter from "./consulting";
import adminRouter from "./admin";
import intakeRouter from "./intake";
import leadsRouter from "./leads";
import checkoutRouter from "./checkout";
import storageRouter from "./storage";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(intakeRouter);
router.use(clientsRouter);
router.use(promptsRouter);
router.use(tokensRouter);
router.use(projectsRouter);
router.use(changeRequestsRouter);
router.use(consultingRouter);
router.use(adminRouter);
router.use(leadsRouter);
router.use(checkoutRouter);
router.use(storageRouter);
router.use(billingRouter);

export default router;
