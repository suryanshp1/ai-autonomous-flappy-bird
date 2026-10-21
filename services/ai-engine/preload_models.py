"""
Model pre-loader for Laya System 1 Decision Engine.
Runs during Docker build or cold-boot to warm up HuggingFace cache and verify checkpoint integrity.
"""
import sys
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("laya-preload")

def preload():
    logger.info("Initializing Laya Router checkpoint preloader...")
    try:
        from laya import Router
        logger.info("Instantiating Router with preload=True...")
        router = Router(preload=True)
        
        # Test dry-run inference
        test_state = "Bird altitude: 4.0, distance: 5.0, velocity: -1.2, gap: 5.0"
        test_questions = {
            "action": {
                "type": "choice",
                "instructions": "Determine bird flight control action.",
                "criteria": {
                    "flap": "Lift needed",
                    "glide": "Momentum sufficient"
                }
            }
        }
        res = router.predict(test_state, test_questions)
        logger.info(f"Dry-run prediction successful! Result: {res}")
        logger.info("Laya checkpoint successfully preloaded and verified.")
        return 0
    except Exception as exc:
        logger.warning(f"Could not preload Laya checkpoint (will load dynamically on startup): {exc}")
        # Non-fatal during offline build environments
        return 0

if __name__ == "__main__":
    sys.exit(preload())
