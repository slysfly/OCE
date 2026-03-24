#!/usr/bin/env python3
import re
import base64
import cgi
"""
OCE RAG知识库系统 - 高级版
支持：项目管理、产品管理、MBA、哲学、商学、历史等知识领域
支持：互联网搜索 + RAG检索 + LLM综合回答
"""

import os
import json
import hashlib
from pathlib import Path
from datetime import datetime
import http.server
import socketserver
import urllib.parse
from urllib.parse import quote
import requests

# 知识库存储目录
KB_DIR = Path(__file__).parent / 'knowledge'
KB_DIR.mkdir(exist_ok=True)

UPLOAD_DIR = KB_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# LLM配置
LLM_CONFIG_FILE = Path(__file__).parent / 'llm_config.json'

def load_llm_config():
    """加载LLM配置"""
    if LLM_CONFIG_FILE.exists():
        with open(LLM_CONFIG_FILE) as f:
            return json.load(f)
    return {"enabled": False}

def call_llm(prompt, system_prompt="你是一个专业的AI助手"):
    """调用LLM API"""
    config = load_llm_config()
    if not config.get("enabled") or not config.get("api_key"):
        return None
    
    try:
        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json"
        }
        
        # 根据不同provider构建请求
        if config.get("provider") == "openai":
            url = f"{config.get('base_url', 'https://api.openai.com/v1')}/chat/completions"
            data = {
                "model": config.get("model", "gpt-3.5-turbo"),
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7
            }
        elif config.get("provider") == "qianwen":
            url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
            headers["X-DashScope-Api-Key"] = config['api_key']
            data = {
                "model": config.get("model", "qwen-turbo"),
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ]
            }
        elif config.get("provider") == "siliconflow":
            # SiliconFlow API (兼容OpenAI格式)
            url = f"{config.get('base_url', 'https://api.siliconflow.cn/v1')}/chat/completions"
            data = {
                "model": config.get("model", "BAAI/bge-m3"),
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "max_tokens": 1024
            }
        else:
            return None
        
        r = requests.post(url, headers=headers, json=data, timeout=30)
        result = r.json()
        
        if "choices" in result:
            return result["choices"][0]["message"]["content"]
        return None
    except Exception as e:
        print(f"LLM调用失败: {e}")
        return None

# 知识库数据
knowledge_base = {
    "categories": [
        {"id": "pm", "name": "项目管理", "icon": "📊", "description": "项目管理体系知识"},
        {"id": "product", "name": "产品管理", "icon": "🎯", "description": "产品经理必备知识"},
        {"id": "mba", "name": "MBA/EMBA", "icon": "🎓", "description": "工商管理硕士知识"},
        {"id": "maoxuan", "name": "毛选马列", "icon": "📚", "description": "毛泽东选集与马列主义"},
        {"id": "yangming", "name": "阳明心学", "icon": "🧘", "description": "王阳明心学智慧"},
        {"id": "bingfa", "name": "孙子兵法", "icon": "⚔️", "description": "孙子兵法战略智慧"},
        {"id": "philosophy", "name": "哲学", "icon": "🤔", "description": "哲学思想体系"},
        {"id": "business", "name": "商学", "icon": "💼", "description": "商业管理与战略"},
        {"id": "history", "name": "历史", "icon": "🏛️", "description": "历史智慧与经验"}
    ],
    "documents": [],
    "chunks": [],
    "learn_history": []
}

# 预置知识内容
PRESET_KNOWLEDGE = {
    "pm": [
        {"title": "项目管理十大知识领域", "content": "项目整合管理、范围管理、进度管理、成本管理、质量管理、资源管理、沟通管理、风险管理、采购管理、利益相关方管理。"},
        {"title": "敏捷开发Sprint流程", "content": "Sprint计划会议 → 每日站会 → Sprint评审 → Sprint回顾 → 下个Sprint。"},
        {"title": "WBS工作分解结构", "content": "Work Breakdown Structure，将项目分解为可管理的小块，便于估算和跟踪。"}
    ],
    "product": [
        {"title": "产品经理核心能力", "content": "需求分析、产品设计、项目管理、数据分析、沟通协调、用户研究、行业洞察。"},
        {"title": "MVP最小可行产品", "content": "Minimum Viable Product，用最少的资源开发最核心的功能，快速验证产品假设。"},
        {"title": "用户画像构建", "content": "基于用户研究，创建典型用户模型，包含基本信息、行为特征、痛点需求、使用场景。"}
    ],
    "mba": [
        {"title": "波特五力模型", "content": "行业内现有竞争者的竞争力、潜在竞争者进入的能力、替代品的替代能力、供应商的议价能力、购买者的议价能力。"},
        {"title": "SWOT分析", "content": "Strengths优势、Weaknesses劣势、Opportunities机会、Threats威胁，企业战略分析工具。"},
        {"title": "商业模式画布", "content": "价值主张、客户细分、渠道通路、客户关系、收入来源、核心资源、关键业务、重要合作、成本结构。"}
    ],
    "maoxuan": [
        {"title": "实事求是", "content": "毛泽东思想的精髓，从实际出发，理论联系实际，在实践中检验和发展真理。"},
        {"title": "矛盾论", "content": "事物发展的根本原因在于事物内部的矛盾性，矛盾普遍存在，矛盾特殊性是事物发展的特殊原因。"},
        {"title": "实践论", "content": "实践是认识的来源、动力、目的和检验真理的唯一标准。"}
    ],
    "yangming": [
        {"title": "致良知", "content": "王阳明心学的核心，每个人都有良知，只要依良知行事，就能达到圣人之境。"},
        {"title": "知行合一", "content": "知是行的主意，行是知的功夫；知是行之始，行是知之成。知识和行动不可分割。"},
        {"title": "心即理", "content": "心外无物，心外无理，一切真理都在心中，求理只需在心上求。"}
    ],
    "bingfa": [
        {"title": "孙子兵法始计篇", "content": "兵者，国之大事，死生之地，存亡之道，不可不察也。"},
        {"title": "知己知彼", "content": "知彼知己，百战不殆；不知彼而知己，一胜一负；不知彼不知己，每战必败。"},
        {"title": "不战而屈人之兵", "content": "上兵伐谋，其次伐交，其次伐兵，其下攻城。不战而屈人之兵，善之善者也。"}
    ],
    "philosophy": [
        {"title": "辩证唯物主义", "content": "世界是物质的，物质是运动的，运动是有规律的，规律是可以认识的。"},
        {"title": "存在主义", "content": "存在先于本质，人必须为自己的存在负责，通过选择和行动创造自己的本质。"},
        {"title": "实用主义", "content": "真理是有用的，有用即真理。观念的意义在于其对行为的实际效果。"}
    ],
    "business": [
        {"title": "蓝海战略", "content": "通过价值创新开辟全新市场空间，避开红海竞争，创造新需求。"},
        {"title": "长尾理论", "content": "互联网时代，冷门产品销量总和可超过主流产品。"},
        {"title": "平台战略", "content": "构建双边市场，吸引供需双方，通过网络效应创造价值。"}
    ],
    "history": [
        {"title": "孙子膑脚", "content": "孙子受膑刑后发愤著书，留下孙子兵法，传世之作。"},
        {"title": "勾践卧薪尝胆", "content": "越王勾践十年生聚，十年教训，最终灭吴复国。"},
        {"title": "三国鼎立", "content": "魏蜀吴三国鼎立局面形成的历史过程与战略博弈。"}
    ]
}

# 初始化知识库
def init_knowledge_base():
    """初始化知识库，预置内容"""
    global knowledge_base
    
    # 检查是否已有数据
    data_file = KB_DIR / 'kb_data.json'
    if data_file.exists():
        try:
            with open(data_file) as f:
                knowledge_base = json.load(f)
            print("✅ 加载已有知识库")
            return
        except:
            pass
    
    # 初始化预设知识
    for cat_id, docs in PRESET_KNOWLEDGE.items():
        for doc in docs:
            doc_id = hashlib.md5(doc['content'].encode()).hexdigest()[:12]
            chunk_id = hashlib.md5((doc['title'] + doc['content'][:50]).encode()).hexdigest()[:12]
            
            # 添加文档
            knowledge_base["documents"].append({
                "id": doc_id,
                "category": cat_id,
                "title": doc["title"],
                "content": doc["content"],
                "created_at": datetime.now().isoformat(),
                "chunk_count": 1
            })
            
            # 添加知识块
            knowledge_base["chunks"].append({
                "id": chunk_id,
                "doc_id": doc_id,
                "category": cat_id,
                "title": doc["title"],
                "content": doc["content"],
                "vector_hint": f"embedded:{cat_id}",  # 简化版向量化提示
                "created_at": datetime.now().isoformat()
            })
    
    # 添加学习历史
    knowledge_base["learn_history"].append({
        "action": "init",
        "content": "系统初始化，预置知识库",
        "timestamp": datetime.now().isoformat()
    })
    
    save_knowledge_base()
    print(f"✅ 初始化知识库: {len(knowledge_base['documents'])} 文档, {len(knowledge_base['chunks'])} 知识块")

def save_knowledge_base():
    """保存知识库"""
    data_file = KB_DIR / 'kb_data.json'
    with open(data_file, 'w') as f:
        json.dump(knowledge_base, f, ensure_ascii=False, indent=2)

# HTTP处理
class KBHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(KB_DIR.parent), **kwargs)
    
    def do_GET(self):
        if self.path == '/' or self.path == '':
            self.path = '/index.html'
        elif self.path == '/api/kb':
            self.handle_kb_info()
            return
        elif self.path.startswith('/api/search'):
            self.handle_search()
            return
        elif self.path.startswith('/api/learn'):
            self.handle_learn()
            return
        return super().do_GET()
    
    def do_POST(self):
        if self.path == '/api/add':
            self.handle_add()
            return
        elif self.path.startswith('/api/chat'):
            self.handle_chat()
            return
        elif self.path == '/api/upload':
            self.handle_upload()
            return
        else:
            self.send_response(404)
            self.end_headers()
    
    def handle_kb_info(self):
        """获取知识库信息"""
        result = {
            "categories": knowledge_base["categories"],
            "stats": {
                "total_docs": len(knowledge_base["documents"]),
                "total_chunks": len(knowledge_base["chunks"]),
                "categories_count": len(knowledge_base["categories"])
            },
            "learn_history": knowledge_base["learn_history"][-10:]
        }
        self.send_json(result)
    
    def handle_search(self):
        """知识搜索"""
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query).get('q', [''])[0]
        if query:
            query = urllib.parse.unquote(query)
        category = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('cat', [''])[0]
        
        if not query:
            self.send_json({"error": "缺少查询参数"})
            return
        
        # 简化版搜索：关键词匹配
        results = []
        for chunk in knowledge_base["chunks"]:
            if category and chunk.get("category") != category:
                continue
            # 计算简单相关性分数
            score = 0
            query_lower = query.lower()
            if query_lower in chunk.get("title", "").lower():
                score += 10
            if query_lower in chunk.get("content", "").lower():
                score += 5
            # 关键词匹配
            keywords = query.split()
            for kw in keywords:
                if kw in chunk.get("content", "").lower():
                    score += 1
            
            if score > 0:
                results.append({
                    **chunk,
                    "score": score
                })
        
        # 按分数排序
        results.sort(key=lambda x: x["score"], reverse=True)
        
        self.send_json({
            "query": query,
            "results": results[:10]
        })
    
    def handle_learn(self):
        """学习新知识"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode()
        data = urllib.parse.parse_qs(body)
        
        content = data.get('content', [''])[0]
        category = data.get('category', ['general'])[0]
        title = data.get('title', ['未知'])[0]
        
        if not content:
            self.send_json({"error": "内容不能为空"})
            return
        
        # 生成ID
        doc_id = hashlib.md5(content.encode()).hexdigest()[:12]
        chunk_id = hashlib.md5((title + content[:50]).encode()).hexdigest()[:12]
        
        # 添加文档
        knowledge_base["documents"].append({
            "id": doc_id,
            "category": category,
            "title": title,
            "content": content,
            "created_at": datetime.now().isoformat(),
            "chunk_count": 1
        })
        
        # 添加知识块
        knowledge_base["chunks"].append({
            "id": chunk_id,
            "doc_id": doc_id,
            "category": category,
            "title": title,
            "content": content,
            "vector_hint": f"learned:{category}",
            "created_at": datetime.now().isoformat()
        })
        
        # 记录学习历史
        knowledge_base["learn_history"].append({
            "action": "learn",
            "title": title,
            "category": category,
            "content_preview": content[:100],
            "timestamp": datetime.now().isoformat()
        })
        
        save_knowledge_base()
        
        self.send_json({
            "success": True,
            "message": f"已学习新知识: {title}",
            "doc_id": doc_id
        })
    
    def handle_upload(self):
        """处理文件上传"""
        try:
            ctype, pdict = cgi.parse_header(self.headers['Content-Type'])
            pdict['boundary'] = pdict['boundary'].encode()
            
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST'}
            )
            
            file_item = form['file']
            category = form.getvalue('category', 'general')
            
            if file_item.filename:
                # 获取文件名和内容
                filename = file_item.filename
                file_content = file_item.file.read()
                
                # 解析文件内容
                extracted_text = self.parse_file(filename, file_content)
                
                if extracted_text:
                    # 分块处理
                    chunks = self.split_text(extracted_text, chunk_size=500)
                    
                    doc_id = hashlib.md5(file_content).hexdigest()[:12]
                    
                    # 添加文档
                    knowledge_base["documents"].append({
                        "id": doc_id,
                        "category": category,
                        "title": f"文件: {filename}",
                        "content": extracted_text[:500] + "...",
                        "source": filename,
                        "created_at": datetime.now().isoformat(),
                        "chunk_count": len(chunks)
                    })
                    
                    # 添加知识块
                    for i, chunk in enumerate(chunks):
                        chunk_id = hashlib.md5((doc_id + str(i)).encode()).hexdigest()[:12]
                        knowledge_base["chunks"].append({
                            "id": chunk_id,
                            "doc_id": doc_id,
                            "category": category,
                            "title": f"{filename} - 第{i+1}部分",
                            "content": chunk,
                            "source": filename,
                            "created_at": datetime.now().isoformat()
                        })
                    
                    # 记录学习历史
                    knowledge_base["learn_history"].append({
                        "action": "upload",
                        "filename": filename,
                        "category": category,
                        "chunks": len(chunks),
                        "timestamp": datetime.now().isoformat()
                    })
                    
                    save_knowledge_base()
                    
                    self.send_json({
                        "success": True,
                        "message": f"文件上传成功: {filename}",
                        "chunks": len(chunks)
                    })
                else:
                    self.send_json({"error": "无法解析文件内容"})
            else:
                self.send_json({"error": "没有选择文件"})
        except Exception as e:
            self.send_json({"error": str(e)})
    
    def parse_file(self, filename, content):
        """解析不同格式的文件"""
        ext = Path(filename).suffix.lower()
        
        try:
            if ext in ['.txt', '.md', '.markdown']:
                return content.decode('utf-8', errors='ignore')
            
            elif ext == '.html':
                # 简单提取HTML文本
                text = content.decode('utf-8', errors='ignore')
                text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL)
                text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
                text = re.sub(r'<[^>]+>', ' ', text)
                text = re.sub(r'\s+', ' ', text).strip()
                return text
            
            elif ext == '.json':
                data = json.loads(content.decode('utf-8'))
                if isinstance(data, list):
                    return '\n'.join([json.dumps(item, ensure_ascii=False) for item in data])
                return json.dumps(data, ensure_ascii=False, indent=2)
            
            elif ext == '.csv':
                return content.decode('utf-8', errors='ignore')
            
            elif ext in ['.docx', '.doc']:
                # 使用python-docx解析
                try:
                    from docx import Document
                    import io
                    doc = Document(io.BytesIO(content))
                    return '\n'.join([para.text for para in doc.paragraphs])
                except:
                    return None
            
            elif ext == '.pdf':
                # 尝试解析PDF
                try:
                    import io
                    try:
                        from pypdf import PdfReader
                        reader = PdfReader(io.BytesIO(content))
                        text = '\n'.join([page.extract_text() or '' for page in reader.pages])
                        return text.strip()
                    except:
                        from PyPDF2 import PdfReader
                        reader = PdfReader(io.BytesIO(content))
                        text = '\n'.join([page.extract_text() or '' for page in reader.pages])
                        return text.strip()
                except:
                    return None
            
            else:
                # 尝试作为文本解析
                return content.decode('utf-8', errors='ignore')
        except:
            return None
    
    def split_text(self, text, chunk_size=500, overlap=50):
        """将文本分块"""
        if not text:
            return []
        
        chunks = []
        sentences = re.split(r'[。！？\n]', text)
        
        current_chunk = ""
        for sentence in sentences:
            if len(current_chunk) + len(sentence) < chunk_size:
                current_chunk += sentence + "。"
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence + "。"
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks
    
    def handle_add(self):
        """添加知识"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode()
        data = urllib.parse.parse_qs(body)
        
        self.handle_learn()
    
    def handle_chat(self):
        """智能问答 - 同时检索RAG知识库和互联网"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode()
        data = urllib.parse.parse_qs(body)
        
        query = urllib.parse.unquote(data.get('query', [''])[0])
        
        if not query:
            self.send_json({"error": "问题不能为空"})
            return
        
        # 1. 检索RAG知识库
        kb_results = []
        for chunk in knowledge_base["chunks"]:
            score = 0
            query_lower = query.lower()
            if query_lower in chunk.get("title", "").lower():
                score += 10
            if query_lower in chunk.get("content", "").lower():
                score += 3
            
            keywords = query.split()
            for kw in keywords:
                if kw in chunk.get("content", "").lower():
                    score += 1
            
            if score > 0:
                kb_results.append({**chunk, "score": score})
        
        kb_results.sort(key=lambda x: x["score"], reverse=True)
        
        # 2. 检索互联网
        web_results = web_search(query, num=3)
        
        # 3. 生成回答
        answer_parts = []
        references = []
        
        if kb_results:
            top_kb = kb_results[:3]
            kb_context = "\n\n".join([f"【知识库】{r['title']}\n{r['content'][:300]}" for r in top_kb])
            answer_parts.append(kb_context)
            references.extend([r["title"] for r in top_kb])
        
        if web_results and not web_results[0].get("error"):
            web_context = "\n\n".join([f"【互联网】{r['title']}\n{r['desc']}" for r in web_results])
            answer_parts.append(web_context)
            references.extend([r["title"] for r in web_results])
        
        # 检查是否启用LLM
        llm_config = load_llm_config()
        use_llm = llm_config.get("enabled", False) and llm_config.get("api_key")
        
        if use_llm and answer_parts:
            # 使用LLM综合回答
            llm_prompt = f"""你是一个专业的AI助手。请根据以下参考资料，用中文回答用户的问题。

用户问题：{query}

参考资料：
{chr(10).join(answer_parts)}

请根据以上参考资料，用简洁专业的语言回答用户的问题。如果资料中没有相关信息，请如实说明。"""

            llm_answer = call_llm(llm_prompt, "你是一个专业的AI助手，擅长根据提供的参考资料回答问题。")
            
            if llm_answer:
                answer = f"🤖 AI综合回答：\n\n{llm_answer}\n\n---\n\n📚 参考来源：\n" + "\n".join([f"- {r}" for r in references[:5]])
            else:
                answer = "🔍 综合检索结果：\n\n" + "\n\n---\n\n".join(answer_parts)
                answer += "\n\n💡 以上信息来自知识库和互联网检索。"
        elif answer_parts:
            answer = "🔍 综合检索结果：\n\n" + "\n\n---\n\n".join(answer_parts)
            answer += "\n\n💡 以上信息来自知识库和互联网检索。"
        else:
            answer = "未找到相关信息。"
        
        self.send_json({
            "query": query,
            "answer": answer,
            "references": references[:6],
            "kb_results": [{"title": r["title"], "score": r["score"]} for r in kb_results[:3]],
            "web_results": [{"title": r["title"], "url": r.get("url", "")} for r in web_results if not r.get("error")]
        })
    
    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

def web_search(query, num=5):
    """互联网搜索"""
    url = f"https://www.bing.com/search?q={quote(query)}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }
    
    try:
        r = requests.get(url, headers=headers, timeout=10)
        
        results = []
        pattern = r'<h2[^>]*>.*?<a[^>]+href=["\'](http[^"\']+)["\'][^>]*>([^<]+)</a>.*?<p[^>]*>([^<]+)</p>'
        matches = re.findall(pattern, r.text, re.DOTALL)
        
        seen = set()
        for href, title, desc in matches:
            if href in seen:
                continue
            seen.add(href)
            title = title.strip()
            desc = desc.strip()[:150]
            results.append({"title": title, "url": href, "desc": desc})
            if len(results) >= num:
                break
        
        return results
    except Exception as e:
        return [{"error": str(e)}]


def main():
    # 初始化知识库
    init_knowledge_base()
    
    # 启动服务器
    PORT = 7893
    
    class ReuseAddrTCPServer(socketserver.TCPServer):
        allow_reuse_address = True
    
    with ReuseAddrTCPServer(('', PORT), KBHandler) as httpd:
        print(f'🧠 OCE RAG知识库系统 → http://0.0.0.0:{PORT}')
        print(f'📚 知识库: {len(knowledge_base["documents"])} 文档, {len(knowledge_base["chunks"])} 知识块')
        httpd.serve_forever()

if __name__ == '__main__':
    main()
