from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.messages import HumanMessage
from pprint import pprint
from langchain.tools import tool
from typing import Dict, Any
from tavily import TavilyClient
from langgraph.checkpoint.memory import InMemorySaver  

load_dotenv()

# tavily search API is used to search the web in a LLM friendly way
tavily_client = TavilyClient()

@tool
def web_search(query: str) -> Dict[str, Any]:

    """Search the web for information"""

    return tavily_client.search(query)

agent_nutrition = create_agent(
    model="gpt-5-nano",
    tools = [web_search],
    checkpointer=InMemorySaver(),  
    streaming=True,
    max_token = 50,
    system_prompt = """
        You are a personal nutritionist who can give suggestions on food recipes that is leftover in the fridge or cupboards of the user.
        You need to ask the user what their nutrional goals are and what human digestion issues they may have in case they have food intollerance.
        They may have a disease like Crohns disease or Irritible Bowel Syndrome.
        """
)
