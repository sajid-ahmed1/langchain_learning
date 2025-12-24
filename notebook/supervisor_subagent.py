# %%
# Friends meetup planner 

from dotenv import load_dotenv
load_dotenv()

# %%
# agent 1 to find postcode into lat/lon then compute midpoint and then area of Lond

import requests
from typing import Tuple, Dict

def postcode_to_latlon(postcode: str) -> Tuple[float, float]:
    """
    Convert a UK postcode into latitude and longitude.

    Args:
        postcode: UK postcode (e.g. "SW1A 1AA")

    Returns:
        A tuple of (latitude, longitude).
    """
    url = f"https://api.postcodes.io/postcodes/{postcode}"
    r = requests.get(url).json()["result"]
    return r["latitude"], r["longitude"]


def midpoint_latlon(
    lat1: float, long1: float, lat2: float, long2: float
) -> Tuple[float, float]:
    """
    Compute the midpoint between two latitude/longitude pairs.

    Args:
        lat1: Latitude of first location.
        long1: Longitude of first location.
        lat2: Latitude of second location.
        long2: Longitude of second location.

    Returns:
        A tuple of (mid_latitude, mid_longitude).
    """
    mid_lat = (lat1 + lat2) / 2
    mid_long = (long1 + long2) / 2
    return mid_lat, mid_long

def latlong_to_area(lat: float, long: float):
    url = f"https://api.postcodes.io/postcodes?lon={long}&lat={lat}&radius=2000&limit=1"
    data = requests.get(url).json()

    if data.get("status") != 200 or not data.get("result"):
        raise ValueError(f"Reverse lookup failed: {data}")

    r = data["result"][0]
    return {
        "postcode": r["postcode"],
        "district": r["admin_district"],
        "region": r["region"],
    }

# agent 2 and 3 will search the web using Tavily Client
from typing import Dict, Any
from tavily import TavilyClient
from langchain.tools import tool

tavily_client = TavilyClient()

@tool
def web_search(query: str) -> Dict[str, Any]:

    """Search the web for information"""

    return tavily_client.search(query)

from langchain.agents import AgentState

# creating a meetup event state to track
class MeetUpState(AgentState):
    person_1_postcode: str
    person_2_postcode: str
    midpoint_area: str
    food_place: str
    activity_place: str

    from langchain.agents import create_agent

# create subagents

midpoint_agent = create_agent(
    model='gpt-5-nano',
    tools=[],
    system_prompt = """
    You are a location agent. 
    You must take the postcode of person 1 and person 2, compute the midpoint between the two, then take the midpoint latlong and get the area it's associated with.
    You will be given no extra information, only the two postcodes in London. 
    Once you have found the area, it will be used for the other agents.
    """ 
)

food_agent = create_agent(
    model='gpt-5-nano',
    tools=[web_search],
    system_prompt = """
       You are a food specialist. Search for food spots in the desired location and give the best 3 options for the user to decide.
    You are not allowed to ask any more follow up questions, you must find the suitable food options based on the following criteria:
    - Halal meats
    - Has google reviews of over 4.3 stars in average
    - Cuisine: Indian, chinese, american, burgers, vegan, vegetarian
    - Is there a space to pray for Muslims?
    You may need to make multiple searches to iteratively find the best options.
        """
)

activity_agent = create_agent(
    model='gpt-5-nano',
    tools=[web_search],
    system_prompt="""
    You are a activity specialist. Search the web for activities to do within the desired location and give the best 3 options for the user to decide.
    You are not allowed to ask any more follow up questions, you must find the suitable food options based on the following criteria:
    - Must be beginner friendly
    - Must be reasonably priced
    - Must have good reviews
    You may need to make multiple queries to iteratively find the best options.
    """
)

from langchain.tools import ToolRuntime
from langchain.messages import HumanMessage, ToolMessage
from langgraph.types import Command

@tool
async def find_area(person_1_postcode: str, person_2_postcode: str, runtime: ToolRuntime) -> Command:
    """Finds the area from given postcodes"""
    p1 = person_1_postcode.replace(" ", "").upper()
    p2 = person_2_postcode.replace(" ", "").upper()

    # call your existing python functions (postcodes.io)
    lat1, lon1 = postcode_to_latlon(p1)
    lat2, lon2 = postcode_to_latlon(p2)
    mid_lat, mid_lon = midpoint_latlon(lat1, lon1, lat2, lon2)
    area = latlong_to_area(mid_lat, mid_lon)

    return await Command(update={
        "person_1_postcode": p1,
        "person_2_postcode": p2,
        "midpoint_area": area["district"],  # or area["postcode"] / area dict
        "messages": [ToolMessage(content="Saved midpoint area", tool_call_id=runtime.tool_call_id)],
    })

@tool
def search_food(runtime: ToolRuntime) -> str:
    """Food agent finds the top 3 most suitable food spots in the desired location"""
    midpoint_area = runtime.state.get("midpoint_area")
    query = f"Find the top 3 suitable food spots within {midpoint_area}"
    response = food_agent.invoke({"messages": [HumanMessage(content=query)]})
    return response['messages'][-1].content

@tool
def search_activity(runtime: ToolRuntime) -> str:
    """Activity agent finds the top 3 most suitable food spots in the desired location"""
    midpoint_area = runtime.state.get("midpoint_area")
    query = f"Find the top 3 suitable activities within {midpoint_area}"
    response = activity_agent.invoke({"messages": [HumanMessage(content=query)]})
    return response['messages'][-1].content

@tool
def update_state(
        person_1_postcode: str,
        person_2_postcode: str,
        midpoint_area: str,
        food_place: str,
        activity_place: str,
        runtime: ToolRuntime
) -> Command:
    """Update the state when you know all of the values"""
    return Command(update={
        "person_1_postcode": person_1_postcode,
        "person_2_postcode": person_2_postcode,
        "midpoint_area": midpoint_area,
        "food_place": food_place,
        "activity_place": activity_place,
        "messages": [ToolMessage("Successfully updated state", tool_call_id=runtime.tool_call_id)],
    })


from langchain.agents import create_agent

coordinator = create_agent(
    model="gpt-5-nano",
    tools=[find_area, search_food, search_activity, update_state],
    state_schema=MeetUpState,
    system_prompt="""
    You are a MeetUp coordinator. Delegate tasks to your specialists for a midpoint area, food spots and activities.
    First find the postcode information (like E1 1HJ) you need to update the state. Once that is done you can delegate the tasks.
    Once you have received their answers, coordinate the perfect meetup potentials for me.
    """
)
# %%
