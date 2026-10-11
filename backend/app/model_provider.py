from .analysis import BaselineModel
class ModelProvider:
    def load(self): return BaselineModel()
    def metadata(self): return {'name':'FrameTrace transparent forensic baseline','version':'frametrace-baseline-0.1','input':'five normalized OpenCV forensic features','limitations':'Not trained on a labeled manipulation dataset; probabilistic research baseline.'}
