import unittest
from app import (
    heuristic_decision,
    compute_kinematic_envelope,
    format_state_string,
    PredictRequest,
    predict,
)


class TestAIEngine(unittest.TestCase):
    def test_state_formatting(self):
        state_dict = {
            "altitude": 4.15,
            "vertical_velocity": -1.82,
            "distance_to_gap": 6.4,
            "gap_center_altitude": 5.2,
            "relative_altitude_to_gap": -1.05,
            "urgency": "high_descent",
        }
        text = format_state_string(state_dict)
        self.assertIn("Bird current altitude is 4.15", text)
        self.assertIn("Vertical velocity is -1.82", text)
        self.assertIn("Relative vertical deviation to gap center is -1.05", text)
        self.assertIn("Projected glide altitude is", text)

    def test_heuristic_low_altitude_flaps(self):
        danger_state = {
            "altitude": 1.1,
            "vertical_velocity": -2.5,
            "distance_to_gap": 5.0,
            "gap_center_altitude": 5.0,
            "relative_altitude_to_gap": -3.9,
            "urgency": "critical_hazard",
        }
        res = heuristic_decision(danger_state)
        self.assertEqual(res["action"], "flap")
        self.assertTrue(res["criticalHazard"])
        self.assertGreater(res["probabilities"]["flap"], 0.7)

    def test_heuristic_high_momentum_glides(self):
        safe_state = {
            "altitude": 6.2,
            "vertical_velocity": 1.5,
            "distance_to_gap": 5.0,
            "gap_center_altitude": 5.0,
            "relative_altitude_to_gap": 1.2,
            "urgency": "nominal",
        }
        res = heuristic_decision(safe_state)
        self.assertEqual(res["action"], "glide")
        self.assertFalse(res["criticalHazard"])

    def test_cbf_prevents_upper_pipe_collision(self):
        # Bird is slightly below gap center (+0.2m) inside pipe corridor; flapping would hit upper lip
        near_top_lip_state = {
            "altitude": 5.2,
            "vertical_velocity": 0.5,
            "distance_to_gap": 1.2,
            "gap_center_altitude": 5.0,
            "gap_height": 3.2,
            "relative_altitude_to_gap": 0.2,
            "urgency": "nominal",
        }
        env = compute_kinematic_envelope(near_top_lip_state)
        self.assertTrue(env["ceiling_breach_if_flap"])
        res = heuristic_decision(near_top_lip_state)
        self.assertEqual(res["action"], "glide")

    def test_predict_endpoint_handler(self):
        req = PredictRequest(
            state={
                "altitude": 3.5,
                "vertical_velocity": -1.2,
                "distance_to_gap": 4.0,
                "gap_center_altitude": 5.0,
                "relative_altitude_to_gap": -1.5,
                "urgency": "high_descent",
            },
            tick=42,
        )
        resp = predict(req)
        self.assertEqual(resp.tick, 42)
        self.assertIn(resp.action, ["flap", "glide"])
        self.assertGreaterEqual(resp.confidence, 0.0)
        self.assertLessEqual(resp.confidence, 1.0)
        self.assertGreaterEqual(resp.inferenceDurationMs, 0.0)


if __name__ == "__main__":
    unittest.main()
