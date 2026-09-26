from eval import metrics


def test_first_concerning_day():
    assert metrics.first_concerning_day(["healthy", "watch", "concerning"]) == 3
    assert metrics.first_concerning_day(["healthy", "watch"]) is None


def test_conversation_metrics():
    gold = ["crisis", "crisis", "healthy", "concerning"]
    pred = ["crisis", "watch", "watch", "concerning"]
    assert metrics.crisis_recall(gold, pred) == 0.5
    assert metrics.healthy_fpr(gold, pred) == 1.0
    assert metrics.concerning_precision(gold, pred) == 1.0


def test_arc_metrics():
    m = metrics.arc_metrics([4, 3, None], [
        ["healthy"] * 3 + ["concerning"] * 4,
        ["healthy"] * 7,
        ["healthy", "concerning"],
    ])
    assert m == {"arc_detection_rate": 0.5, "median_days_to_detection": 4, "early_flags": 1}
